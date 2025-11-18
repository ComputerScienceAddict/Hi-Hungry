import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseServer";

export const runtime = "nodejs";

type FoodStore = {
  id: string | number;
  name: string;
  cuisine: string;
  spiceLevel: string;
  distance: string;
  description: string;
  specialties: string[];
  image: string;
  gallery?: string[];
  isNew?: boolean;
  lat?: number;
  lon?: number;
  phone?: string;
  website?: string;
  rating?: number;
  ratingCount?: number;
  priceLevel?: number;
  openingHours?: {
    weekdayText?: string[];
    openNow?: boolean;
  };
  reviews?: Array<{
    authorName: string;
    rating: number;
    text: string;
    time: number;
  }>;
  businessStatus?: string;
  formattedAddress?: string;
};

type GooglePlace = {
  place_id: string;
  name: string;
  geometry: { location: { lat: number; lng: number } };
  vicinity?: string;
  formatted_address?: string;
  types?: string[];
  rating?: number;
  user_ratings_total?: number;
  price_level?: number;
  photos?: {
    photo_reference: string;
    width: number;
    height: number;
    html_attributions?: string[];
  }[];
};

type GalleryEntry = {
  id: string;
  image_base64: string;
  attribution?: string | null;
  width?: number | null;
  height?: number | null;
};

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return "";
  if (meters < 1000) return `${Math.round(meters)} m away`;
  const km = meters / 1000;
  return `${km.toFixed(1)} km away`;
}

function getCuisineFallbackImageFromTypes(types: string[] | undefined): string {
  const joined = (types || []).join(",").toLowerCase();
  if (joined.includes("mexican")) {
    return "https://images.unsplash.com/photo-1617196034796-73dfa7b1fd56?auto=format&fit=crop&w=900&q=80";
  }
  if (joined.includes("sushi") || joined.includes("japanese")) {
    return "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=80";
  }
  if (joined.includes("chinese")) {
    return "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=900&q=80";
  }
  if (joined.includes("indian")) {
    return "https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=900&q=80";
  }
  if (joined.includes("pizza") || joined.includes("italian")) {
    return "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=900&q=80";
  }
  if (joined.includes("burger")) {
    return "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=900&q=80";
  }
  return "https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&w=900&q=80";
}

async function fetchGooglePhotoDataUrl(photoReference: string, apiKey: string, maxWidth: number = 900, maxHeight?: number): Promise<string> {
  const photoUrl = new URL("https://maps.googleapis.com/maps/api/place/photo");
  photoUrl.searchParams.set("maxwidth", maxWidth.toString());
  if (maxHeight) {
    photoUrl.searchParams.set("maxheight", maxHeight.toString());
  }
  photoUrl.searchParams.set("photo_reference", photoReference);
  photoUrl.searchParams.set("key", apiKey);

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

  try {
    const res = await fetch(photoUrl.toString(), {
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Photo fetch failed: ${res.status} ${text.slice(0, 120)}`);
    }
    
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await res.arrayBuffer()).toString("base64");
    return `data:${contentType};base64,${buffer}`;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Photo fetch timeout after 10 seconds');
    }
    throw err;
  }
}

type PlaceDetails = {
  cover: string;
  gallery: string[];
  description?: string;
  phone?: string;
  website?: string;
  internationalPhone?: string;
  openingHours?: {
    weekdayText?: string[];
    openNow?: boolean;
  };
  reviews?: Array<{
    authorName: string;
    rating: number;
    text: string;
    time: number;
  }>;
  businessStatus?: string;
};

async function getOrCachePlacePhotos(params: {
  placeId: string;
  name: string;
  lat: number;
  lon: number;
  formattedAddress?: string | null;
  primaryType?: string | null;
  types?: string[];
  rating?: number | null;
  ratingCount?: number | null;
  priceLevel?: number | null;
  photos?: GooglePlace["photos"];
}): Promise<PlaceDetails> {
  const {
    placeId,
    name,
    lat,
    lon,
    formattedAddress,
    primaryType,
    types,
    rating,
    ratingCount,
    priceLevel,
    photos: initialPhotos,
  } = params;
  
  // Use mutable variable for photos (may be updated from Place Details)
  let photos = initialPhotos;

  const fallback = getCuisineFallbackImageFromTypes(types);
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error("GOOGLE_PLACES_API_KEY missing");
    return { cover: fallback, gallery: [], description: undefined };
  }

  const { data: existing, error } = await supabaseAdmin
    .from("places")
    .select("id, cover_image_base64, photo_gallery, formatted_address, phone, website_url, opening_hours, reviews, business_status, international_phone_number, raw_payload, last_updated_at, expires_at")
    .eq("source", "google")
    .eq("source_place_id", placeId)
    .maybeSingle();

  if (error) {
    console.error("Supabase select error", error.message);
  }

  const cachedGallery = Array.isArray(existing?.photo_gallery)
    ? (existing?.photo_gallery as GalleryEntry[])
    : null;

  // Check if cache is still valid (30 days for place data, 7 days for photos)
  const now = new Date();
  const cacheAge = existing?.last_updated_at 
    ? (now.getTime() - new Date(existing.last_updated_at).getTime()) / (1000 * 60 * 60 * 24) // days
    : Infinity;
  
  const isCacheValid = existing?.expires_at 
    ? new Date(existing.expires_at) > now
    : cacheAge < 30; // Default 30 day cache if no expiration set

  // Return cached data immediately - NO Google API calls if we have valid cache
  if (existing?.cover_image_base64 && isCacheValid) {
    // gallery in DB stores all photos (cover + extras), but API returns gallery as extras only
    // IMPORTANT: Limit to max 3 gallery photos (4 total including cover) to save costs
    const allUrls = cachedGallery && cachedGallery.length > 0
      ? cachedGallery.map((entry) => entry.image_base64).filter(Boolean).slice(0, 4) // Max 4 total (cover + 3 gallery)
      : [];
    
    const coverFromCache = existing.cover_image_base64 || allUrls[0] || fallback;
    // Limit gallery to max 3 photos (after cover)
    const galleryWithoutCover = allUrls.length > 1 ? allUrls.slice(1, 4) : [];
    
    // Extract cached description from raw_payload if available
    const cachedDescription = existing.raw_payload && typeof existing.raw_payload === 'object' && 'description' in existing.raw_payload
      ? (existing.raw_payload as { description?: string }).description
      : undefined;
    
    const cachedOpeningHours = existing.opening_hours && typeof existing.opening_hours === 'object'
      ? existing.opening_hours as { weekday_text?: string[]; open_now?: boolean }
      : undefined;
    
    const cachedReviews = Array.isArray(existing.reviews) ? existing.reviews as Array<{
      author_name: string;
      rating: number;
      text: string;
      time: number;
    }> : undefined;
    
    console.log(`[CACHE HIT] Returning cached data for ${name} (${galleryWithoutCover.length} gallery photos)`);
    return {
      cover: coverFromCache,
      gallery: galleryWithoutCover,
      description: cachedDescription,
      phone: existing.phone ?? undefined,
      website: existing.website_url ?? undefined,
      internationalPhone: existing.international_phone_number ?? undefined,
      openingHours: cachedOpeningHours ? {
        weekdayText: cachedOpeningHours.weekday_text,
        openNow: cachedOpeningHours.open_now,
      } : undefined,
      reviews: cachedReviews?.map(r => ({
        authorName: r.author_name,
        rating: r.rating,
        text: r.text,
        time: r.time,
      })),
      businessStatus: existing.business_status ?? undefined,
    };
  }

  // Only fetch Place Details if we don't have complete cached data
  const hasCompleteCache = existing && 
    existing.phone && 
    existing.website_url && 
    existing.opening_hours && 
    existing.reviews &&
    isCacheValid;

  let placeDetails: {
    description?: string;
    phone?: string;
    website?: string;
    internationalPhone?: string;
    openingHours?: { weekday_text?: string[]; open_now?: boolean };
    reviews?: Array<{ author_name: string; rating: number; text: string; time: number }>;
    businessStatus?: string;
  } = {};
  
  // Skip Place Details API call if we have complete cached data
  if (!hasCompleteCache) {
    try {
      const detailsUrl = new URL("https://maps.googleapis.com/maps/api/place/details/json");
      detailsUrl.searchParams.set("place_id", placeId);
    // Request comprehensive fields including photos
    detailsUrl.searchParams.set("fields", [
      "editorial_summary",
      "reviews",
      "formatted_phone_number",
      "international_phone_number",
      "website",
      "opening_hours",
      "business_status",
      "photos", // Ensure photos are included in Place Details
    ].join(","));
      detailsUrl.searchParams.set("key", apiKey);
      
      const detailsRes = await fetch(detailsUrl.toString());
      if (detailsRes.ok) {
        const detailsData = await detailsRes.json();
        const result = detailsData.result;
        
        // Extract description
        if (result?.editorial_summary?.overview) {
          placeDetails.description = result.editorial_summary.overview;
        } else if (result?.reviews?.[0]?.text) {
          placeDetails.description = result.reviews[0].text.slice(0, 200) + (result.reviews[0].text.length > 200 ? "..." : "");
        }
        
        // Extract contact info
        placeDetails.phone = result.formatted_phone_number;
        placeDetails.internationalPhone = result.international_phone_number;
        placeDetails.website = result.website;
        
        // Extract opening hours
        if (result.opening_hours) {
          placeDetails.openingHours = {
            weekday_text: result.opening_hours.weekday_text,
            open_now: result.opening_hours.open_now,
          };
        }
        
        // Extract reviews (limit to first 5)
        if (Array.isArray(result.reviews) && result.reviews.length > 0) {
          placeDetails.reviews = result.reviews.slice(0, 5).map((r: any) => ({
            author_name: r.author_name,
            rating: r.rating,
            text: r.text,
            time: r.time,
          }));
        }
        
        // Extract business status
        placeDetails.businessStatus = result.business_status;
        
        // If photos weren't in Nearby Search but are in Place Details, use them
        // (photos parameter already includes photos from Nearby Search, but Place Details may have more)
        if (Array.isArray(result.photos) && result.photos.length > 0 && (!photos || photos.length === 0)) {
          // Update photos array if we got them from Place Details
          photos = result.photos.map((p: any) => ({
            photo_reference: p.photo_reference,
            width: p.width,
            height: p.height,
            html_attributions: p.html_attributions,
          }));
        } else if (Array.isArray(result.photos) && result.photos.length > (photos?.length || 0)) {
          // If Place Details has more photos than Nearby Search, use those
          photos = result.photos.map((p: any) => ({
            photo_reference: p.photo_reference,
            width: p.width,
            height: p.height,
            html_attributions: p.html_attributions,
          }));
        }
      }
    } catch (err) {
      console.error("Error fetching place details", err);
    }
  } else {
    console.log(`[CACHE HIT] Skipping Place Details API call for ${name} - complete data cached`);
  }

  // Only fetch photos if we don't have them cached or cache is expired
  const hasCachedPhotos = existing?.cover_image_base64 && 
    cachedGallery && 
    cachedGallery.length > 0 && 
    isCacheValid;

  const photoRefs = photos?.filter((p) => p.photo_reference) ?? [];
  
  // Skip photo fetching if we have valid cached photos
  if (hasCachedPhotos && photoRefs.length > 0) {
    console.log(`[CACHE HIT] Skipping photo fetch for ${name} - ${cachedGallery.length} photos already cached`);
    // Use cached photos but still update place details if needed
    // gallery in DB stores all photos (cover + extras), but API returns gallery as extras only
    // IMPORTANT: Limit to max 3 gallery photos (4 total including cover) to save costs
    const allUrls = cachedGallery.map((entry) => entry.image_base64).filter(Boolean).slice(0, 4);
    const coverDataUrl = existing.cover_image_base64 || allUrls[0] || fallback;
    const galleryWithoutCover = allUrls.length > 1 ? allUrls.slice(1, 4) : [];
    
    // Update place details if we fetched new ones
    if (!hasCompleteCache && (placeDetails.phone || placeDetails.website || placeDetails.openingHours)) {
      await supabaseAdmin.from("places").update({
        phone: placeDetails.phone ?? existing.phone ?? null,
        website_url: placeDetails.website ?? existing.website_url ?? null,
        international_phone_number: placeDetails.internationalPhone ?? existing.international_phone_number ?? null,
        opening_hours: placeDetails.openingHours ?? existing.opening_hours ?? null,
        reviews: placeDetails.reviews ?? existing.reviews ?? null,
        business_status: placeDetails.businessStatus ?? existing.business_status ?? null,
        raw_payload: placeDetails.description ? { description: placeDetails.description } : existing.raw_payload,
        last_updated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }).eq("id", existing.id);
    }
    
    return {
      cover: coverDataUrl,
      gallery: galleryWithoutCover,
      description: placeDetails.description || (existing.raw_payload && typeof existing.raw_payload === 'object' && 'description' in existing.raw_payload
        ? (existing.raw_payload as { description?: string }).description
        : undefined),
      phone: placeDetails.phone || (existing.phone ?? undefined),
      website: placeDetails.website || (existing.website_url ?? undefined),
      internationalPhone: placeDetails.internationalPhone || (existing.international_phone_number ?? undefined),
      openingHours: placeDetails.openingHours ? {
        weekdayText: placeDetails.openingHours.weekday_text,
        openNow: placeDetails.openingHours.open_now,
      } : (existing.opening_hours && typeof existing.opening_hours === 'object'
        ? {
            weekdayText: (existing.opening_hours as { weekday_text?: string[] }).weekday_text,
            openNow: (existing.opening_hours as { open_now?: boolean }).open_now,
          }
        : undefined),
      reviews: placeDetails.reviews?.map(r => ({
        authorName: r.author_name,
        rating: r.rating,
        text: r.text,
        time: r.time,
      })) || (Array.isArray(existing.reviews) ? existing.reviews.map((r: any) => ({
        authorName: r.author_name,
        rating: r.rating,
        text: r.text,
        time: r.time,
      })) : undefined),
      businessStatus: placeDetails.businessStatus || (existing.business_status ?? undefined),
    };
  }
  
  if (photoRefs.length === 0) {
    await supabaseAdmin.from("places").upsert(
      {
        source: "google",
        source_place_id: placeId,
        name,
        formatted_address: formattedAddress ?? null,
        lat,
        lon,
        primary_type: primaryType ?? "restaurant",
        type_tags: types?.join(",") ?? null,
        rating: rating ?? null,
        rating_count: ratingCount ?? null,
        price_level: priceLevel ?? null,
        phone: placeDetails.phone ?? null,
        website_url: placeDetails.website ?? null,
        international_phone_number: placeDetails.internationalPhone ?? null,
        map_url: `https://www.google.com/maps/place/?q=place_id:${placeId}`,
        cover_image_base64: null,
        photo_gallery: [],
        has_photos: false,
        opening_hours: placeDetails.openingHours ?? null,
        reviews: placeDetails.reviews ?? null,
        business_status: placeDetails.businessStatus ?? null,
        raw_payload: placeDetails.description ? { description: placeDetails.description } : null,
        last_updated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days cache
      },
      { onConflict: "source,source_place_id" },
    );
    return {
      cover: fallback,
      gallery: [],
      description: placeDetails.description,
      phone: placeDetails.phone,
      website: placeDetails.website,
      internationalPhone: placeDetails.internationalPhone,
      openingHours: placeDetails.openingHours ? {
        weekdayText: placeDetails.openingHours.weekday_text,
        openNow: placeDetails.openingHours.open_now,
      } : undefined,
      reviews: placeDetails.reviews?.map(r => ({
        authorName: r.author_name,
        rating: r.rating,
        text: r.text,
        time: r.time,
      })),
      businessStatus: placeDetails.businessStatus,
    };
  }

  // Fetch up to 4 photos total (1 cover + 3 gallery)
  const maxPhotos = Math.min(4, photoRefs.length);
  const minPhotos = Math.min(4, photoRefs.length); // Try to get 4 if available
  const galleryEntries: GalleryEntry[] = [];
  
  // Fetch photos with retry logic to ensure we get at least 4 if available
  for (let i = 0; i < maxPhotos && (galleryEntries.length < minPhotos || i < maxPhotos); i++) {
    const photo = photoRefs[i];
    const photoRef = photo.photo_reference;
    if (!photoRef) continue;
    
    let retries = 2;
    let success = false;
    
    while (retries > 0 && !success) {
      try {
        const dataUrl = await fetchGooglePhotoDataUrl(photoRef, apiKey);
        galleryEntries.push({
          id: photoRef,
          image_base64: dataUrl,
          attribution: photo.html_attributions?.join(" ") ?? null,
          width: photo.width ?? null,
          height: photo.height ?? null,
        });
        success = true;
      } catch (err) {
        retries--;
        if (retries === 0) {
          console.error(`Unable to fetch photo ${i + 1} for ${name} after retries:`, err);
        } else {
          // Wait a bit before retry
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }
    
    // If we have at least 4 photos and we're past the minimum, we can stop early
    // But continue to try getting more up to maxPhotos
  }
  
  console.log(`[PHOTOS] Fetched ${galleryEntries.length} photos for ${name} (requested: ${minPhotos}-${maxPhotos}, available: ${photoRefs.length})`);

  if (galleryEntries.length === 0) {
    return {
      cover: fallback,
      gallery: [],
      description: placeDetails.description,
      phone: placeDetails.phone,
      website: placeDetails.website,
      internationalPhone: placeDetails.internationalPhone,
      openingHours: placeDetails.openingHours ? {
        weekdayText: placeDetails.openingHours.weekday_text,
        openNow: placeDetails.openingHours.open_now,
      } : undefined,
      reviews: placeDetails.reviews?.map(r => ({
        authorName: r.author_name,
        rating: r.rating,
        text: r.text,
        time: r.time,
      })),
      businessStatus: placeDetails.businessStatus,
    };
  }

  // cover = first photo, gallery = remaining photos (extras only)
  // IMPORTANT: Limit to max 3 gallery photos (4 total including cover) to save costs
  const coverDataUrl = galleryEntries[0]?.image_base64 ?? fallback;
  const galleryWithoutCover = galleryEntries.slice(1, 4).map((entry) => entry.image_base64).filter(Boolean);

  const { data: upserted, error: upsertErr } = await supabaseAdmin
    .from("places")
    .upsert(
      {
        source: "google",
        source_place_id: placeId,
        name,
        formatted_address: formattedAddress ?? null,
        lat,
        lon,
        primary_type: primaryType ?? "restaurant",
        type_tags: types?.join(",") ?? null,
        rating: rating ?? null,
        rating_count: ratingCount ?? null,
        price_level: priceLevel ?? null,
        phone: placeDetails.phone ?? null,
        website_url: placeDetails.website ?? null,
        international_phone_number: placeDetails.internationalPhone ?? null,
        map_url: `https://www.google.com/maps/place/?q=place_id:${placeId}`,
        google_photo_reference: galleryEntries[0]?.id ?? null,
        cover_image_base64: coverDataUrl,
        photo_gallery: galleryEntries, // Store all photos (cover + extras) in DB
        has_photos: true,
        opening_hours: placeDetails.openingHours ?? null,
        reviews: placeDetails.reviews ?? null,
        business_status: placeDetails.businessStatus ?? null,
        raw_payload: placeDetails.description ? { description: placeDetails.description } : null,
        last_updated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days cache
      },
      { onConflict: "source,source_place_id" },
    )
    .select("id")
    .maybeSingle();

  if (upsertErr) {
    console.error("Supabase upsert error (places)", upsertErr.message);
  }

  const placeIdDb = upserted?.id;
  if (placeIdDb) {
    for (const [index, entry] of galleryEntries.entries()) {
      const { error: photoErr } = await supabaseAdmin.from("place_photos").upsert(
        {
          place_id: placeIdDb,
          source_photo_id: entry.id,
          image_base64: entry.image_base64,
          attribution: entry.attribution ?? null,
          width: entry.width ?? null,
          height: entry.height ?? null,
          is_primary: index === 0,
        },
        { onConflict: "place_id,source_photo_id" },
      );
      if (photoErr) {
        console.error("Supabase upsert error (place_photos)", photoErr.message);
      }
    }
  }

  return {
    cover: coverDataUrl,
    gallery: galleryWithoutCover, // Return only additional photos (not including cover)
    description: placeDetails.description,
    phone: placeDetails.phone,
    website: placeDetails.website,
    internationalPhone: placeDetails.internationalPhone,
    openingHours: placeDetails.openingHours ? {
      weekdayText: placeDetails.openingHours.weekday_text,
      openNow: placeDetails.openingHours.open_now,
    } : undefined,
    reviews: placeDetails.reviews?.map(r => ({
      authorName: r.author_name,
      rating: r.rating,
      text: r.text,
      time: r.time,
    })),
    businessStatus: placeDetails.businessStatus,
  };
}

// Helper function to create a cache key for nearby search
function createSearchCacheKey(lat: number, lon: number, radius: number): string {
  // Round to ~100m precision to increase cache hits
  const roundedLat = Math.round(lat * 100) / 100;
  const roundedLon = Math.round(lon * 100) / 100;
  const roundedRadius = Math.round(radius / 100) * 100; // Round to nearest 100m
  return `${roundedLat},${roundedLon},${roundedRadius}`;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = parseFloat(searchParams.get("lat") || "");
    const lon = parseFloat(searchParams.get("lon") || "");
    const radius = parseInt(searchParams.get("radius") || "2000", 10);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return NextResponse.json(
        { error: "lat and lon are required query parameters" },
        { status: 400 },
      );
    }

    const clampedRadius = Math.max(200, Math.min(5000, radius));
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      console.error("GOOGLE_PLACES_API_KEY is not set");
      return NextResponse.json(
        { error: "Server not configured with Google Places API key", restaurants: [] },
        { status: 500 },
      );
    }

    // Check if we have cached nearby search results
    const searchRadius = clampedRadius * 1.2; // 20% buffer for cache matching
    const latDelta = searchRadius / 111000; // ~111km per degree latitude
    const lonDelta = searchRadius / (111000 * Math.cos(lat * Math.PI / 180));
    
    // Try to find cached places within the search radius
    const { data: cachedPlaces, error: cacheError } = await supabaseAdmin
      .from("places")
      .select("source_place_id, name, lat, lon, formatted_address, type_tags, rating, rating_count, price_level, photo_gallery")
      .eq("source", "google")
      .gte("lat", lat - latDelta)
      .lte("lat", lat + latDelta)
      .gte("lon", lon - lonDelta)
      .lte("lon", lon + lonDelta)
      .not("cover_image_base64", "is", null)
      .gt("last_updated_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) // Within 30 days
      .limit(60); // Allow up to 60 cached places to match Google Places pagination

    let places: GooglePlace[] = [];
    let usedCache = false;

    // If we have enough cached places (at least 5), use them instead of API call
    if (cachedPlaces && cachedPlaces.length >= 5 && !cacheError) {
      console.log(`[CACHE HIT] Using ${cachedPlaces.length} cached places for search near ${lat},${lon}`);
      places = cachedPlaces.map((p: any) => ({
        place_id: p.source_place_id,
        name: p.name,
        geometry: { location: { lat: p.lat, lng: p.lon } },
        vicinity: p.formatted_address,
        formatted_address: p.formatted_address,
        types: p.type_tags ? p.type_tags.split(",") : [],
        rating: p.rating,
        user_ratings_total: p.rating_count,
        price_level: p.price_level,
        photos: Array.isArray(p.photo_gallery) && p.photo_gallery.length > 0 
          ? p.photo_gallery.map((entry: any) => ({ photo_reference: entry.id || "" }))
          : [],
      }));
      usedCache = true;
    } else {
      // No cache hit, make API call
      // Note: Nearby Search API returns up to 20 results per page, with an optional next_page_token.
      // To better approximate "all restaurants in the area", we follow pagination up to 3 pages (max ~60 results).
      console.log(`[API CALL] Fetching places from Google API for ${lat},${lon}`);
      const baseUrl = "https://maps.googleapis.com/maps/api/place/nearbysearch/json";

      const url = new URL(baseUrl);
      url.searchParams.set("location", `${lat},${lon}`);
      url.searchParams.set("radius", clampedRadius.toString());
      url.searchParams.set("type", "restaurant");
      url.searchParams.set("key", apiKey);

      const allResults: GooglePlace[] = [];

      const fetchPage = async (pageToken?: string | null) => {
        const pageUrl = new URL(baseUrl);
        if (pageToken) {
          // When using a page token, Google ignores most other params except key + pagetoken
          pageUrl.searchParams.set("pagetoken", pageToken);
        } else {
          pageUrl.searchParams.set("location", `${lat},${lon}`);
          pageUrl.searchParams.set("radius", clampedRadius.toString());
          pageUrl.searchParams.set("type", "restaurant");
        }
        pageUrl.searchParams.set("key", apiKey);

        const res = await fetch(pageUrl.toString());
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          console.error("Google Places error", res.status, text.slice(0, 200));
          return { results: [] as GooglePlace[], next_page_token: undefined as string | undefined };
        }

        const json = await res.json();
        const results = (json.results || []) as GooglePlace[];
        const nextToken = json.next_page_token as string | undefined;
        return { results, next_page_token: nextToken };
      };

      // Fetch first page
      const firstPage = await fetchPage();
      allResults.push(...firstPage.results);

      let nextToken = firstPage.next_page_token;

      // Google requires a short delay before a next_page_token becomes valid
      // Follow up to 2 additional pages (max ~60 results total)
      for (let i = 0; i < 2 && nextToken; i++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const page = await fetchPage(nextToken);
        allResults.push(...page.results);
        nextToken = page.next_page_token;
      }

      // De-duplicate by place_id and cap to 60 for safety
      const seen = new Set<string>();
      places = allResults.filter((p) => {
        const id = p.place_id;
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      }).slice(0, 60);
    }

    // Process places in parallel batches for better performance
    // Batch size of 5 to avoid overwhelming APIs while still being fast
    const BATCH_SIZE = 5;
    const stores: FoodStore[] = [];
    
    // Helper function to process a single place
    const processPlace = async (place: GooglePlace): Promise<FoodStore | null> => {
      const plat = place.geometry?.location?.lat;
      const plon = place.geometry?.location?.lng;
      if (plat == null || plon == null) return null;

      const distanceMeters = haversineMeters(lat, lon, plat, plon);
      const primaryType = place.types?.[0] ?? "restaurant";

      // Fast cuisine detection using early returns
      let cuisine = "Restaurant";
      const typesLower = (place.types || []).map((t) => t.toLowerCase());
      if (typesLower.some((t) => t.includes("mexican"))) cuisine = "Mexican";
      else if (typesLower.some((t) => t.includes("japanese") || t.includes("sushi"))) cuisine = "Japanese";
      else if (typesLower.some((t) => t.includes("italian"))) cuisine = "Italian";
      else if (typesLower.some((t) => t.includes("chinese"))) cuisine = "Chinese";
      else if (typesLower.some((t) => t.includes("indian"))) cuisine = "Indian";
      else if (typesLower.some((t) => t.includes("burger") || t.includes("american"))) cuisine = "American";

      // Fast spice level detection
      let spiceLevel = "Mild";
      const cuisineLower = cuisine.toLowerCase();
      if (cuisineLower === "indian" || cuisineLower === "thai") spiceLevel = "Hot";
      else if (cuisineLower === "mexican" || cuisineLower === "korean") spiceLevel = "Medium";

      // Fetch place data (this handles caching internally)
      const placeData = await getOrCachePlacePhotos({
        placeId: place.place_id,
        name: place.name,
        lat: plat,
        lon: plon,
        formattedAddress: place.vicinity ?? place.formatted_address ?? null,
        primaryType,
        types: place.types,
        rating: place.rating ?? null,
        ratingCount: place.user_ratings_total ?? null,
        priceLevel: place.price_level ?? null,
        photos: place.photos,
      });

      // Build description efficiently
      let description: string;
      if (placeData.description) {
        description = placeData.description;
      } else {
        const descriptionParts: string[] = [];
        if (place.vicinity) descriptionParts.push(place.vicinity);
        if (place.rating) descriptionParts.push(`Rated ${place.rating.toFixed(1)} / 5`);
        if (place.user_ratings_total) descriptionParts.push(`${place.user_ratings_total} reviews`);
        if (place.price_level != null) {
          const dollarSigns = "$".repeat(Math.max(1, Math.min(4, place.price_level + 1)));
          descriptionParts.push(`${dollarSigns} price level`);
        }
        description =
          descriptionParts.length > 0
            ? descriptionParts.join(" · ")
            : `Local ${cuisine.toLowerCase()} spot.`;
      }

      // Build specialties efficiently
      const specialties: string[] = [cuisine];
      if (place.rating && place.rating >= 4.0) specialties.push("Highly rated");
      if (place.user_ratings_total && place.user_ratings_total > 200) specialties.push("Popular");
      if (placeData.openingHours?.openNow) specialties.push("Open now");

      return {
        id: place.place_id,
        name: place.name,
        cuisine,
        spiceLevel,
        distance: formatDistance(distanceMeters),
        description,
        specialties: specialties.slice(0, 3),
        image: placeData.cover,
        gallery: placeData.gallery,
        isNew: false,
        lat: plat,
        lon: plon,
        phone: placeData.phone,
        website: placeData.website,
        rating: place.rating ?? undefined,
        ratingCount: place.user_ratings_total ?? undefined,
        priceLevel: place.price_level ?? undefined,
        openingHours: placeData.openingHours,
        reviews: placeData.reviews,
        businessStatus: placeData.businessStatus,
        formattedAddress: place.vicinity ?? place.formatted_address ?? undefined,
      };
    };

    // Process in parallel batches for optimal performance
    for (let i = 0; i < places.length; i += BATCH_SIZE) {
      const batch = places.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map(processPlace));
      
      // Collect successful results
      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          stores.push(result.value);
        }
      }
    }

    stores.sort((a, b) => {
      const getMeters = (s: FoodStore) => {
        const num = parseFloat(s.distance);
        return Number.isNaN(num) ? Number.MAX_SAFE_INTEGER : num;
      };
      return getMeters(a) - getMeters(b);
    });

    const restaurants: FoodStore[] = stores.map((s, idx) => ({
      ...s,
      isNew: idx === 0,
    }));

    return NextResponse.json({ restaurants, count: restaurants.length });
  } catch (err) {
    console.error("Unexpected error in /api/restaurants", err);
    return NextResponse.json(
      { error: "Unexpected server error", restaurants: [] },
      { status: 500 },
    );
  }
}
