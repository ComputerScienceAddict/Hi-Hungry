"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import {
  Heart,
  MapPin,
  X,
  Home as HomeIcon,
  History,
  Check,
  SlidersHorizontal,
  Star,
  Loader2,
  UtensilsCrossed,
  ChefHat,
} from "lucide-react";
import Link from "next/link";

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

// Fallback restaurants if location is not available
const FALLBACK_STORES: FoodStore[] = [
  {
    id: 1,
    name: "Sesame Chicken",
    cuisine: "Chinese",
    spiceLevel: "Mild",
    distance: "0.8 km away",
    description: "Sweet flavors with chicken. Crispy texture.",
    specialties: ["Sesame", "Chicken", "Crispy"],
    image:
      "https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=800&q=80",
    isNew: true,
  },
  {
    id: 2,
    name: "Sakura Sushi Bar",
    cuisine: "Japanese",
    spiceLevel: "Mild",
    distance: "1.5 km away",
    description:
      "Fresh sashimi and hand-rolled maki. Omakase available on weekends.",
    specialties: ["Sashimi", "Omakase", "Sake selection"],
    image:
      "https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: 3,
    name: "La Dolce Vita",
    cuisine: "Italian",
    spiceLevel: "Mild",
    distance: "2.2 km away",
    description:
      "Authentic Neapolitan pizza and house-made pasta. Cozy trattoria vibes.",
    specialties: ["Wood-fired pizza", "Fresh pasta", "Wine bar"],
    image:
      "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: 4,
    name: "Spice Route",
    cuisine: "Indian",
    spiceLevel: "Hot",
    distance: "3.1 km away",
    description:
      "Bold flavors from North and South India. Vegetarian-friendly options.",
    specialties: ["Butter chicken", "Biryani", "Tandoori"],
    image:
      "https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: 5,
    name: "Taco Libre",
    cuisine: "Mexican",
    spiceLevel: "Medium",
    distance: "4.5 km away",
    description:
      "Street-style tacos and fresh margaritas. Late-night hours on weekends.",
    specialties: ["Al pastor", "Carnitas", "Craft cocktails"],
    image:
      "https://images.unsplash.com/photo-1565299585323-38174c0b5d0a?auto=format&fit=crop&w=800&q=80",
  },
];

const SWIPE_THRESHOLD = 225; // Distance threshold (like the React Native tutorial)
const SWIPE_VELOCITY_THRESHOLD = 500; // Velocity threshold for quick swipes

type DragInfo = {
  offset: { x: number; y: number };
  velocity: { x: number; y: number };
};

// Helper function to parse distance string to meters
function parseDistanceToMeters(distance: string): number | null {
  if (!distance) return null;
  const lower = distance.toLowerCase();
  const num = parseFloat(lower);
  if (Number.isNaN(num)) return null;
  if (lower.includes("mi") || lower.includes("mile")) return num * 1609.34; // Convert miles to meters
  if (lower.includes("km")) return num * 1000;
  if (lower.includes("m") && !lower.includes("mile")) return num;
  return null;
}

// Convert meters to miles and format as string
function formatDistanceInMiles(meters: number | null): string {
  if (meters == null || !Number.isFinite(meters)) return "Unknown distance";
  const miles = meters / 1609.34;
  if (miles < 0.1) {
    const feet = meters * 3.28084;
    return `${Math.round(feet)} ft away`;
  }
  if (miles < 1) {
    return `${miles.toFixed(1)} mi away`;
  }
  return `${miles.toFixed(1)} mi away`;
}

// User preferences type for recommendations
type UserPreferences = {
  favoriteCuisines: Record<string, number>;
  avgRating: number;
  avgDistance: number;
  preferredPriceLevels: Record<number, number>;
  preferredSpiceLevels: Record<string, number>;
  totalSaved: number;
};

// Extract user preferences from saved restaurants
function extractPreferences(saved: FoodStore[]): UserPreferences {
  if (saved.length === 0) {
    return {
      favoriteCuisines: {},
      avgRating: 0,
      avgDistance: 0,
      preferredPriceLevels: {},
      preferredSpiceLevels: {},
      totalSaved: 0,
    };
  }

  const cuisineCounts: Record<string, number> = {};
  const priceCounts: Record<number, number> = {};
  const spiceCounts: Record<string, number> = {};
  let totalRating = 0;
  let ratingCount = 0;
  let totalDistance = 0;
  let distanceCount = 0;

  for (const store of saved) {
    if (store.cuisine) cuisineCounts[store.cuisine] = (cuisineCounts[store.cuisine] || 0) + 1;
    if (typeof store.priceLevel === "number") priceCounts[store.priceLevel] = (priceCounts[store.priceLevel] || 0) + 1;
    if (store.spiceLevel) spiceCounts[store.spiceLevel] = (spiceCounts[store.spiceLevel] || 0) + 1;
    if (typeof store.rating === "number" && store.rating > 0) {
      totalRating += store.rating;
      ratingCount++;
    }
    const meters = parseDistanceToMeters(store.distance);
    if (meters != null && Number.isFinite(meters)) {
      totalDistance += meters;
      distanceCount++;
    }
  }

  return {
    favoriteCuisines: cuisineCounts,
    avgRating: ratingCount > 0 ? totalRating / ratingCount : 0,
    avgDistance: distanceCount > 0 ? totalDistance / distanceCount : 0,
    preferredPriceLevels: priceCounts,
    preferredSpiceLevels: spiceCounts,
    totalSaved: saved.length,
  };
}

// Optimized scoring function - pre-compute values to avoid repeated calculations
function scoreRecommendation(restaurant: FoodStore, preferences: UserPreferences, metersCache?: number | null): number {
  let score = 0;
  
  // Pre-compute distance if not cached
  const meters = metersCache ?? parseDistanceToMeters(restaurant.distance);
  
  // Cuisine match (fast lookup)
  const cuisine = restaurant.cuisine || "";
  const cuisineCount = preferences.favoriteCuisines[cuisine] || 0;
  if (cuisineCount > 0) {
    score += cuisineCount >= 3 ? 25 : cuisineCount * 8;
  } else if (preferences.totalSaved > 0) {
    score -= 2;
  }

  // Rating scoring (optimized)
  const rating = restaurant.rating;
  if (typeof rating === "number" && rating > 0) {
    const avgRating = preferences.avgRating;
    if (avgRating > 0) {
      const ratingDiff = Math.abs(rating - avgRating);
      score += ratingDiff < 0.5 ? 20 : ratingDiff < 1.0 ? 12 : 5;
      if (avgRating >= 4.0 && rating >= 4.5) score += 8;
    } else {
      score += rating * 3;
    }
    const ratingCount = restaurant.ratingCount;
    if (ratingCount && ratingCount > 100) {
      score += Math.min(ratingCount / 300, 3);
    }
  }

  // Distance scoring (optimized with pre-computed meters)
  if (meters != null && Number.isFinite(meters) && meters > 0) {
    const avgDistance = preferences.avgDistance;
    if (avgDistance > 0) {
      const distanceDiff = Math.abs(meters - avgDistance);
      score += distanceDiff < 500 ? 15 : distanceDiff < 1000 ? 10 : 0;
      if (avgDistance < 1000 && meters < 1500) score += 12;
    }
    // Absolute distance bonuses (optimized)
    if (meters < 500) score += 10;
    else if (meters < 1000) score += 7;
    else if (meters < 2000) score += 4;
    else if (meters < 5000) score += 1;
  }

  // Price level (fast lookup)
  const priceLevel = restaurant.priceLevel;
  if (typeof priceLevel === "number") {
    const priceCount = preferences.preferredPriceLevels[priceLevel] || 0;
    score += priceCount > 0 ? priceCount * 5 : -1;
  }

  // Spice level (fast lookup)
  const spice = restaurant.spiceLevel || "";
  const spiceCount = preferences.preferredSpiceLevels[spice] || 0;
  if (spiceCount > 0) score += spiceCount * 3;

  // Diversity bonus
  if (preferences.totalSaved >= 5 && cuisineCount === 0) score += 2;
  
  // Quality indicators
  if (restaurant.isNew) score += 3;
  if (restaurant.openingHours?.openNow) score += 5;

  return score;
}

export default function Home() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [lastDirection, setLastDirection] = useState<"left" | "right" | null>(
    null,
  );
  const [saved, setSaved] = useState<FoodStore[]>([]);
  const [swipedRestaurants, setSwipedRestaurants] = useState<Array<FoodStore & { swipeDirection: "left" | "right" }>>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [saveBurstId, setSaveBurstId] = useState(0);
  const [cardExitDirection, setCardExitDirection] = useState<"left" | "right" | null>(null);
  const [showCheckmark, setShowCheckmark] = useState(false);
  const [restaurants, setRestaurants] = useState<FoodStore[]>([]);
  const [locationStatus, setLocationStatus] = useState<"idle" | "locating" | "loading" | "error">("idle");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [radius, setRadius] = useState(3219); // Default 2 miles (~3219 meters)
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<"home" | "discover" | "history" | "recommendations">("discover");
  const [selectedRestaurant, setSelectedRestaurant] = useState<FoodStore | null>(null);
  const [recommendations, setRecommendations] = useState<FoodStore[]>([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [recommendationsError, setRecommendationsError] = useState<string | null>(null);
  const hasFetchedRestaurantsRef = useRef(false); // Track if we've already fetched restaurants
  const swipeCountRef = useRef(0); // Track swipe count for recommendation updates

  // On first load in the browser, restore any saved restaurants from localStorage.
  // This lets us keep your saves even if you refresh the page.
  const hasRestoredSavedRef = useRef(false);
  
  useEffect(() => {
    if (typeof window === "undefined" || hasRestoredSavedRef.current) return;
    
    try {
      const stored = window.localStorage.getItem("hihungry_saved_restaurants");
      if (!stored) {
        hasRestoredSavedRef.current = true;
        return;
      }

      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        // Check if it's new format (minimal data) or old format (full objects)
        if (parsed.length > 0 && parsed[0] && typeof parsed[0] === "object" && "id" in parsed[0] && !("image" in parsed[0])) {
          // New format: minimal data objects (no images/galleries)
          const minimalData = parsed as Array<{
            id: string | number;
            name?: string;
            cuisine?: string;
            rating?: number;
            distance?: string;
            priceLevel?: number;
            spiceLevel?: string;
          }>;
          
          // Try to restore full objects from restaurants list first
          if (restaurants.length > 0) {
            const restaurantMap = new Map(restaurants.map((r) => [String(r.id), r]));
            const restored = minimalData
              .map((minimal) => {
                const full = restaurantMap.get(String(minimal.id));
                return full || {
                  ...minimal,
                  description: "",
                  specialties: [],
                  image: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=400&q=80",
                  gallery: [],
                } as FoodStore;
              })
              .filter((r): r is FoodStore => r !== undefined);
            if (restored.length > 0) {
              setSaved(restored);
              hasRestoredSavedRef.current = true;
            }
          } else {
            // No restaurants loaded yet, use minimal data
            const restored = minimalData.map((minimal) => ({
              ...minimal,
              description: "",
              specialties: [],
              image: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=400&q=80",
              gallery: [],
            })) as FoodStore[];
            setSaved(restored);
            hasRestoredSavedRef.current = true;
          }
        } else {
          // Old format: full objects (for backward compatibility)
          // But still optimize by removing large fields if needed
          const fullObjects = parsed as FoodStore[];
          const optimized = fullObjects.map((obj) => ({
            ...obj,
            // Keep images but remove gallery if it's too large
            gallery: Array.isArray(obj.gallery) && obj.gallery.length > 4 ? obj.gallery.slice(0, 4) : obj.gallery,
          }));
          setSaved(optimized);
          hasRestoredSavedRef.current = true;
        }
      }
    } catch (err) {
      console.error("Failed to read saved restaurants from localStorage", err);
      hasRestoredSavedRef.current = true;
    }
  }, [restaurants.length]); // Re-run when restaurants are loaded

  // Enrich saved restaurants with full data when restaurants are loaded
  const savedLengthForEnrichment = saved.length;
  const restaurantsLengthForEnrichment = restaurants.length;
  
  useEffect(() => {
    if (restaurantsLengthForEnrichment === 0 || savedLengthForEnrichment === 0) return;
    if (hasRestoredSavedRef.current === false) return; // Don't enrich until initial restore is done
    
    // Check if any saved restaurants need enrichment (have placeholder images)
    const needsEnrichment = saved.some((s) => s.image && s.image.includes("unsplash.com"));
    if (!needsEnrichment) return;
    
    const restaurantMap = new Map(restaurants.map((r) => [String(r.id), r]));
    const enriched = saved.map((savedItem) => {
      const full = restaurantMap.get(String(savedItem.id));
      // Only replace if we found a full object with a real image
      if (full && full.image && !full.image.includes("unsplash.com")) {
        return full;
      }
      return savedItem;
    });
    
    // Only update if we actually enriched something
    const wasEnriched = enriched.some((item, index) => {
      const original = saved[index];
      return item.image !== original.image || item.gallery !== original.gallery;
    });
    if (wasEnriched) {
      setSaved(enriched);
    }
  }, [restaurantsLengthForEnrichment, savedLengthForEnrichment]);

  // Whenever the saved list changes, write it to localStorage.
  // Store only minimal essential data (no images/galleries/descriptions) to save space
  useEffect(() => {
    if (typeof window === "undefined" || saved.length === 0) {
      // Clear storage if no saved restaurants
      try {
        window.localStorage.removeItem("hihungry_saved_restaurants");
      } catch (err) {
        // Ignore errors when clearing
      }
      return;
    }

    try {
      // Store only essential fields needed for recommendations (no images/galleries/descriptions)
      const minimalData = saved.map((s) => ({
        id: s.id,
        name: s.name,
        cuisine: s.cuisine,
        rating: s.rating,
        distance: s.distance,
        priceLevel: s.priceLevel,
        spiceLevel: s.spiceLevel,
      }));
      
      const cacheString = JSON.stringify(minimalData);
      
      // Only cache if it's small enough
      // Minimal data: ~100-200 bytes per restaurant vs ~5-10KB with images
      // 100 restaurants = ~10-20KB, well under quota
      if (cacheString.length < 50000) {
        window.localStorage.setItem("hihungry_saved_restaurants", cacheString);
      } else {
        // If too many saved restaurants, store only the most recent 100
        const recentMinimal = saved.slice(-100).map((s) => ({
          id: s.id,
          name: s.name,
          cuisine: s.cuisine,
          rating: s.rating,
          distance: s.distance,
          priceLevel: s.priceLevel,
          spiceLevel: s.spiceLevel,
        }));
        const recentCacheString = JSON.stringify(recentMinimal);
        if (recentCacheString.length < 50000) {
          window.localStorage.setItem("hihungry_saved_restaurants", recentCacheString);
        }
      }
    } catch (err) {
      // If cache fails (quota exceeded), clear old data and try again with fewer items
      try {
        window.localStorage.removeItem("hihungry_saved_restaurants");
        // Try storing only the most recent 50 restaurants
        const recentMinimal = saved.slice(-50).map((s) => ({
          id: s.id,
          name: s.name,
          cuisine: s.cuisine,
          rating: s.rating,
          distance: s.distance,
          priceLevel: s.priceLevel,
          spiceLevel: s.spiceLevel,
        }));
        const recentCacheString = JSON.stringify(recentMinimal);
        if (recentCacheString.length < 50000) {
          window.localStorage.setItem("hihungry_saved_restaurants", recentCacheString);
        }
      } catch (retryErr) {
        // Silently fail - saved restaurants are already in React state
        // User can still use the app, just won't persist across refreshes
      }
    }
  }, [saved]);

  // Load cached recommendations when saved restaurants are loaded
  // Note: We only cache IDs, so we restore from restaurants list if available
  const savedLength = saved.length;
  const restaurantsLength = restaurants.length;
  const recommendationsLength = recommendations.length;
  
  useEffect(() => {
    if (typeof window === "undefined" || savedLength === 0) return;
    
    // Only try to restore cache if we don't already have recommendations
    if (recommendationsLength > 0) return;
    
    try {
      const cachedRaw = window.localStorage.getItem("hihungry_recommendations_cache");
      const cachedSavedCountRaw = window.localStorage.getItem("hihungry_recommendations_saved_count");
      
      if (cachedRaw && cachedSavedCountRaw) {
        const cachedData = JSON.parse(cachedRaw) as Array<{ id: string; score: number }>;
        const cachedSavedCount = parseInt(cachedSavedCountRaw, 10);
        
        // Only use cache if saved count matches (user hasn't saved new restaurants)
        if (Array.isArray(cachedData) && cachedData.length > 0 && cachedSavedCount === savedLength) {
          // If we have restaurants loaded, try to restore from them
          if (restaurantsLength > 0) {
            const savedIds = new Set(saved.map((s) => String(s.id)));
            const restaurantMap = new Map(restaurants.map((r) => [String(r.id), r]));
            
            const restoredRecommendations = cachedData
              .map((cached) => {
                const restaurant = restaurantMap.get(cached.id);
                if (!restaurant || savedIds.has(cached.id)) return null;
                return { ...restaurant, _score: cached.score };
              })
              .filter((r): r is FoodStore & { _score: number } => r !== null);
            
            if (restoredRecommendations.length > 0) {
              setRecommendations(restoredRecommendations);
            }
          }
        }
      }
    } catch (err) {
      console.error("Failed to load cached recommendations", err);
    }
  }, [savedLength, restaurantsLength, recommendationsLength]);

  // Extract user preferences - memoized for stability
  const preferences = useMemo(() => extractPreferences(saved), [saved]);
  const savedLengthForRecs = saved.length;

  // Fetch recommendations function
  const fetchRecommendations = useCallback(async () => {
    // Don't run algorithm if no saved restaurants (no swipe history)
    if (!userLocation || savedLengthForRecs === 0) {
      setRecommendations([]); // Clear any existing recommendations
      setRecommendationsError(null); // Clear error
      setRecommendationsLoading(false);
      return;
    }

    setRecommendationsLoading(true);
    setRecommendationsError(null);

    try {
      // 10 miles = ~16093 meters
      const params = new URLSearchParams({
        lat: String(userLocation.lat),
        lon: String(userLocation.lon),
        radius: "16093",
      });

      const response = await fetch(`/api/restaurants?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch restaurants");

      const data = await response.json();
      const allRestaurants = (data.restaurants || []) as FoodStore[];
      const savedIds = new Set(saved.map((s) => String(s.id)));
      const newRestaurants = allRestaurants.filter((r) => !savedIds.has(String(r.id)));

      if (newRestaurants.length === 0) {
        setRecommendationsError("No new restaurants found nearby.");
        setRecommendationsLoading(false);
        return;
      }

      // Pre-compute distance for all restaurants to optimize scoring
      const restaurantsWithDistance = newRestaurants.map((restaurant) => ({
        restaurant,
        meters: parseDistanceToMeters(restaurant.distance),
      }));

      // Score all restaurants with pre-computed distances (faster)
      const scored = restaurantsWithDistance.map(({ restaurant, meters }) => ({
        restaurant,
        score: scoreRecommendation(restaurant, preferences, meters),
      }));

      scored.sort((a, b) => {
        const scoreDiff = b.score - a.score;
        if (Math.abs(scoreDiff) > 0.1) return scoreDiff;
        const ratingA = a.restaurant.rating ?? 0;
        const ratingB = b.restaurant.rating ?? 0;
        if (ratingB !== ratingA) return ratingB - ratingA;
        const distA = parseDistanceToMeters(a.restaurant.distance) ?? Infinity;
        const distB = parseDistanceToMeters(b.restaurant.distance) ?? Infinity;
        return distA - distB;
      });

      const topRecommendations = scored.slice(0, 20).map((entry) => ({
        ...entry.restaurant,
        _score: entry.score,
      }));

      setRecommendations(topRecommendations);
      
      // Cache recommendations - only store IDs and scores to save space
      // Full data stays in React state, cache is just for quick reference
      if (typeof window !== "undefined") {
        try {
          // Only cache top 10 to keep size minimal (IDs are usually ~20 chars each)
          const cacheData = topRecommendations.slice(0, 10).map((r) => ({
            id: String(r.id),
            score: (r as any)._score ?? 0,
          }));
          const cacheString = JSON.stringify(cacheData);
          // Only cache if it's small enough (less than 512 bytes)
          if (cacheString.length < 512) {
            window.localStorage.setItem("hihungry_recommendations_cache", cacheString);
            window.localStorage.setItem("hihungry_recommendations_saved_count", String(savedLengthForRecs));
          }
        } catch (err) {
          // If cache fails (quota exceeded), just continue without caching
          // Recommendations are already in state, so they'll still work
          // Silently fail - no need to log or warn
        }
      }
    } catch (err) {
      console.error("Error fetching recommendations:", err);
      setRecommendationsError("Failed to load recommendations. Please try again.");
    } finally {
      setRecommendationsLoading(false);
    }
  }, [userLocation, savedLengthForRecs, preferences]);

  // Auto-manage recommendations when saved restaurants change
  // We ONLY clear recommendations here; we DO NOT auto-fetch.
  // The recommendation algorithm is triggered explicitly:
  // - every 10 swipes (in handleDecision)
  // - when the user taps the Refresh button
  const savedLengthForAutoFetch = saved.length;
  
  useEffect(() => {
    // If user has no saved restaurants, keep For You empty
    if (savedLengthForAutoFetch === 0) {
      setRecommendations([]);
      setRecommendationsError(null);
      setRecommendationsLoading(false);
    }
    // If there ARE saved restaurants, we leave existing recommendations as-is.
    // New recommendations will be fetched after every 10 swipes or on manual Refresh.
  }, [savedLengthForAutoFetch]);

  // Fetch restaurants from API based on location
  const fetchRestaurants = useCallback(async (lat: number, lon: number, searchRadius: number) => {
    try {
      setLocationStatus("loading");
      setLocationError(null);

      const params = new URLSearchParams({
        lat: String(lat),
        lon: String(lon),
        radius: String(searchRadius),
      });

      const response = await fetch(`/api/restaurants?${params.toString()}`);

      if (!response.ok) {
        throw new Error("Failed to fetch restaurants");
      }

      const data = await response.json();
      const fetchedRestaurants = (data.restaurants || []).map((r: FoodStore, index: number) => ({
        ...r,
        isNew: index === 0, // Mark first restaurant as new
        image: r.image || "https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&w=900&q=80", // Fallback image
        gallery: r.gallery || [],
      }));

      if (fetchedRestaurants.length > 0) {
        setRestaurants(fetchedRestaurants);
        setActiveIndex(0); // Reset to first restaurant
      } else {
        // Fallback to default restaurants if none found
        setRestaurants(FALLBACK_STORES);
      }
      setLocationStatus("idle");
    } catch (err) {
      console.error("Error fetching restaurants:", err);
      setLocationStatus("error");
      setLocationError("Failed to load nearby restaurants. Using sample data.");
      setRestaurants(FALLBACK_STORES);
    }
  }, []);

  // Request location and fetch restaurants on mount - only once, NEVER reload
  useEffect(() => {
    // Don't fetch if we already fetched (prevents reload on tab switch)
    if (hasFetchedRestaurantsRef.current) {
      return;
    }

    if (!("geolocation" in navigator)) {
      setLocationError("Geolocation not supported. Using sample data.");
      setRestaurants(FALLBACK_STORES);
      hasFetchedRestaurantsRef.current = true;
      return;
    }

    setLocationStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ lat: latitude, lon: longitude });
        hasFetchedRestaurantsRef.current = true; // Mark as fetched
        
        // Save location to localStorage
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(
              "hihungry_user_location",
              JSON.stringify({ lat: latitude, lon: longitude })
            );
          } catch (err) {
            console.error("Failed to save location to localStorage", err);
          }
        }
        
        fetchRestaurants(latitude, longitude, radius);
      },
      (error) => {
        console.error("Geolocation error:", error);
        hasFetchedRestaurantsRef.current = true; // Mark as attempted
        setLocationStatus("error");
        if (error.code === error.PERMISSION_DENIED) {
          setLocationError("Location access denied. Using sample data.");
        } else {
          setLocationError("Could not get your location. Using sample data.");
        }
        setRestaurants(FALLBACK_STORES);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );
  }, []); // Only run once on mount - NEVER reload, even on tab switch

  const remainingStores = useMemo(
    () => restaurants.slice(activeIndex),
    [restaurants, activeIndex],
  );

  const currentStore = remainingStores[0];

  // Reset checkmark when card changes
  useEffect(() => {
    setShowCheckmark(false);
  }, [currentStore?.id]);

  const handleDecision = useCallback(
    (direction: "left" | "right") => {
      if (!currentStore) return;

      // Set exit direction immediately - this will be used by the exiting card
      setCardExitDirection(direction);
      setLastDirection(direction);

      // Track all swiped restaurants (both left and right)
      setSwipedRestaurants((prev) => [
        { ...currentStore, swipeDirection: direction },
        ...prev,
      ]);

      if (direction === "right") {
        setSaved((prev) => [currentStore, ...prev]);
        setSaveBurstId((id) => id + 1); // pulse on save
        setShowCheckmark(true);
        // Hide checkmark after animation
        setTimeout(() => setShowCheckmark(false), 600);
      }

      // Increment swipe count and refresh recommendations every 10 swipes
      swipeCountRef.current += 1;
      if (swipeCountRef.current >= 10) {
        swipeCountRef.current = 0;
        // Trigger recommendation refresh if we have location
        // Check saved.length after the current swipe (will be +1 if swiped right)
        const willHaveSaved = direction === "right" ? saved.length + 1 : saved.length;
        if (userLocation && willHaveSaved > 0) {
          // Use setTimeout to avoid state update during render
          setTimeout(() => {
            fetchRecommendations();
          }, 100);
        }
      }

      // Update index to trigger card exit
      setActiveIndex((prev) => prev + 1);
    },
    [currentStore, userLocation, saved.length, fetchRecommendations],
  );

  const handleDragEnd = useCallback(
    (info: DragInfo) => {
      // onDragEnd only fires when gesture is complete (equivalent to state === 5 in React Native)
      const swipeVelocity = info.velocity.x;
      const swipeDistance = info.offset.x;

      // Prioritize distance threshold - if user dragged far enough, trust that direction
      if (swipeDistance > SWIPE_THRESHOLD) {
        // Swiped right - distance threshold met
        handleDecision("right");
      }
      else if (swipeDistance < -SWIPE_THRESHOLD) {
        // Swiped left - distance threshold met
        handleDecision("left");
      }
      // If distance threshold not met, check velocity (but only if distance and velocity agree)
      else if (swipeVelocity > SWIPE_VELOCITY_THRESHOLD && swipeDistance > 0) {
        // Fast right swipe - velocity threshold met AND moving right
        handleDecision("right");
      }
      else if (swipeVelocity < -SWIPE_VELOCITY_THRESHOLD && swipeDistance < 0) {
        // Fast left swipe - velocity threshold met AND moving left
        handleDecision("left");
      }
      // Otherwise, card will spring back to center (handled by dragSnapToOrigin)
    },
    [handleDecision],
  );

  const resetDeck = () => {
    setActiveIndex(0);
    setSaved([]);
    setSwipedRestaurants([]);
    setLastDirection(null);
    setCardExitDirection(null);
    setSaveBurstId(0);
    // Re-fetch restaurants if we have location
    if (userLocation) {
      fetchRestaurants(userLocation.lat, userLocation.lon, radius);
    }
  };

  // Handle radius change
  const handleRadiusChange = (newRadius: number) => {
    const clampedRadius = Math.max(500, Math.min(16093, newRadius)); // Allow up to 10 miles
    setRadius(clampedRadius);
    if (userLocation) {
      fetchRestaurants(userLocation.lat, userLocation.lon, clampedRadius);
    }
  };

  return (
    <div className="fixed inset-0 h-full w-full overflow-hidden bg-white">
      {/* Status bar safe area */}
      <div className="h-safe-top bg-white" />
      
      {/* hihungry Header */}
      <header className="absolute top-0 left-0 right-0 z-30 pt-safe-top pb-3 px-6 bg-white/95 backdrop-blur-sm border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 tracking-wide uppercase" style={{ fontFamily: 'sans-serif', letterSpacing: '0.05em' }}>
            hihungry
          </h1>
          <div className="relative">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Settings"
            >
              <SlidersHorizontal className="h-6 w-6" />
            </motion.button>

            {/* Settings Dropdown */}
            <AnimatePresence>
              {showSettings && (
                <>
                  {/* Backdrop */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setShowSettings(false)}
                    className="fixed inset-0 z-40"
                  />
                  
                  {/* Settings Panel */}
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="absolute right-0 top-full mt-2 z-50 w-64 bg-white rounded-xl shadow-2xl p-4"
                  >
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Settings</h3>
                    
                    {userLocation && locationStatus === "idle" ? (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-2">
                            Search Radius
                          </label>
                          <select
                            value={radius}
                            onChange={(e) => {
                              handleRadiusChange(Number.parseInt(e.target.value, 10));
                              setShowSettings(false);
                            }}
                            className="w-full bg-gray-50 text-gray-900 text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                          >
                            <option value={804}>0.5 miles</option>
                            <option value={1609}>1 mile</option>
                            <option value={3219}>2 miles</option>
                            <option value={4828}>3 miles</option>
                            <option value={8047}>5 miles</option>
                            <option value={16093}>10 miles</option>
                          </select>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500">
                        Enable location to adjust search radius
                      </p>
                    )}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* Loading state */}
      {(locationStatus === "locating" || locationStatus === "loading") && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white">
          <div className="text-center">
            <div className="mb-4 text-gray-900 text-lg">
              {locationStatus === "locating" ? "Getting your location..." : "Finding nearby restaurants..."}
            </div>
            <div className="h-1 w-48 bg-gray-200 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gray-900"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Content based on active tab */}
      {activeTab === "discover" && (
        <div className="absolute inset-0 h-full w-full">
          <div className="relative h-full">
            <AnimatePresence mode="wait" onExitComplete={() => setCardExitDirection(null)}>
              {currentStore && (
                <SwipeCard
                  key={currentStore.id}
                  store={currentStore}
                  lastDirection={cardExitDirection}
                  onDragEnd={handleDragEnd}
                  showCheckmark={showCheckmark}
                />
              )}
            </AnimatePresence>

            {!currentStore && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 220, damping: 20 }}
                className="absolute inset-0 flex items-center justify-center bg-white p-6"
              >
                <div className="max-w-sm rounded-2xl bg-gray-50 border border-gray-200 p-8 shadow-lg">
                  <h2 className="mb-3 text-2xl font-semibold text-gray-900 text-center">
                    All caught up
                  </h2>
                  <p className="mb-8 text-sm text-gray-600 text-center leading-relaxed">
                    You&apos;ve seen all available restaurants. Reset to discover more.
                  </p>
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={resetDeck}
                    className="w-full rounded-lg bg-gray-900 px-6 py-3 text-sm font-medium text-white shadow-md transition hover:bg-gray-800"
                  >
                    Reset &amp; Start Over
                  </motion.button>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      )}

      {activeTab === "home" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 bg-white pt-32 pb-24 overflow-y-auto"
        >
          <div className="max-w-6xl mx-auto px-4">
            <h2 className="text-3xl font-bold text-gray-900 mb-2 px-2">Nearby Restaurants</h2>
            <p className="text-gray-600 mb-6 px-2">
              {restaurants.length} {restaurants.length === 1 ? "restaurant" : "restaurants"} found
            </p>
            {restaurants.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4">
                <p className="mb-2 text-lg font-semibold text-gray-900">
                  No restaurants found
                </p>
                <p className="max-w-xs text-center text-sm leading-relaxed text-gray-600">
                  {locationStatus === "loading" ? "Loading restaurants..." : "Try adjusting your search radius in settings."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
                {restaurants.map((store, index) => (
                  <motion.div
                    key={store.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => setSelectedRestaurant(store)}
                    className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white cursor-pointer transition-all hover:border-gray-300 hover:shadow-xl active:scale-[0.98]"
                  >
                    <div className="relative h-48 w-full overflow-hidden">
                      <img
                        src={store.image || "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=400&q=80"}
                        alt={store.name}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=400&q=80";
                        }}
                      />
                      {store.isNew && (
                        <span className="absolute top-3 left-3 bg-teal-500 text-white text-xs font-semibold px-2 py-1 rounded-full shadow-md">
                          New
                        </span>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="text-lg font-bold text-gray-900 mb-1 line-clamp-1">
                        {store.name}
                      </h3>
                      <div className="flex items-center gap-2 mb-2 text-sm">
                        <span className="text-gray-700">{store.cuisine}</span>
                        <span className="text-gray-400">•</span>
                        <span className="flex items-center gap-1 text-gray-600">
                          <MapPin className="h-3.5 w-3.5" />
                          {formatDistanceInMiles(parseDistanceToMeters(store.distance))}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-2 mb-3">
                        {store.description}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {store.specialties.slice(0, 2).map((specialty) => (
                          <span
                            key={specialty}
                            className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700"
                          >
                            {specialty}
                          </span>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {activeTab === "history" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 bg-white pt-32 pb-24 overflow-y-auto"
        >
          <div className="max-w-2xl mx-auto px-4">
            <h2 className="text-3xl font-bold text-gray-900 mb-2 px-2">Swipe History</h2>
            <p className="text-gray-600 mb-6 px-2">
              {swipedRestaurants.length} {swipedRestaurants.length === 1 ? "restaurant" : "restaurants"} swiped
            </p>
            {swipedRestaurants.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4">
                <motion.div
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    repeatDelay: 1,
                  }}
                  className="mb-6"
                >
                  <History className="h-16 w-16 text-gray-400" />
                </motion.div>
                <p className="mb-2 text-lg font-semibold text-gray-900">
                  No swipe history yet
                </p>
                <p className="max-w-xs text-center text-sm leading-relaxed text-gray-600">
                  Start swiping on restaurants to see your history here.
                </p>
              </div>
            ) : (
              <div className="space-y-3 pb-4">
                {swipedRestaurants.map((store, index) => (
                  <motion.div
                    key={`${store.id}-${index}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                    onClick={() => setSelectedRestaurant(store)}
                    className="group flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 transition-all hover:border-gray-300 hover:shadow-md active:scale-[0.99] cursor-pointer"
                  >
                    <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl shadow-sm">
                      <img
                        src={store.image || "/placeholder.svg"}
                        alt={store.name}
                        className="h-20 w-20 object-cover rounded-xl shadow-sm transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="mb-1 text-lg font-bold text-gray-900">
                        {store.name}
                      </span>
                      <div className="mb-1.5 flex items-center gap-2 text-sm">
                        <span className="font-medium text-gray-700">
                          {store.cuisine}
                        </span>
                        <span className="text-gray-400">•</span>
                        <span className="flex items-center gap-1 text-xs text-gray-600">
                          <MapPin className="h-3.5 w-3.5" />
                          {formatDistanceInMiles(parseDistanceToMeters(store.distance))}
                        </span>
                      </div>
                      <p className="line-clamp-1 text-sm leading-relaxed text-gray-600">
                        {store.description}
                      </p>
                    </div>
                    {store.swipeDirection === "right" ? (
                      <Check className="h-5 w-5 flex-shrink-0 text-teal-500" />
                    ) : (
                      <X className="h-5 w-5 flex-shrink-0 text-red-500" />
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {activeTab === "recommendations" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 bg-white pt-32 pb-24 overflow-y-auto"
        >
          <div className="max-w-3xl mx-auto px-4">
            <h2 className="text-3xl font-bold text-gray-900 mb-2 px-2">For You</h2>
            <p className="text-gray-600 mb-6 px-2">
              New places tailored to your taste
            </p>
            {saved.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-gray-300 bg-gray-50 px-6 py-16 text-center">
                <ChefHat className="h-12 w-12 text-gray-400 mb-4" />
                <p className="mb-2 text-lg font-semibold text-gray-900">
                  No swipe history yet
                </p>
                <p className="max-w-sm text-sm text-gray-600">
                  Start swiping on restaurants in the Discover tab to save your favorites. 
                  Once you&apos;ve saved a few places, we&apos;ll find NEW restaurants that match your taste!
                </p>
              </div>
            ) : recommendationsLoading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400 mb-4" />
                <p className="text-sm text-gray-600">Finding perfect matches for you...</p>
              </div>
            ) : recommendationsError ? (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-gray-300 bg-gray-50 px-6 py-16 text-center">
                <p className="mb-2 text-lg font-semibold text-gray-900">Oops!</p>
                <p className="max-w-sm text-sm text-gray-600 mb-4">{recommendationsError}</p>
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={fetchRecommendations}
                  className="rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
                >
                  Try Again
                </motion.button>
              </div>
            ) : recommendations.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-gray-300 bg-gray-50 px-6 py-16 text-center">
                <p className="mb-2 text-lg font-semibold text-gray-900">
                  No recommendations yet
                </p>
                <p className="max-w-sm text-sm text-gray-600 mb-4">
                  We&apos;re finding new places that match your preferences...
                </p>
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={fetchRecommendations}
                  className="rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
                >
                  Refresh
                </motion.button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
                  <p className="text-sm text-gray-700">
                    <span className="font-semibold text-teal-900">Smart Recommendations:</span>{" "}
                    Based on your {saved.length} saved {saved.length === 1 ? "restaurant" : "restaurants"}, 
                    we found {recommendations.length} NEW places that match your preferences for{" "}
                    <span className="font-medium">
                      {Object.keys(preferences.favoriteCuisines).slice(0, 2).join(", ")}
                      {Object.keys(preferences.favoriteCuisines).length > 2 && " and more"}
                    </span>
                    .
                  </p>
                </div>

                <div className="space-y-3 pt-1">
                  {recommendations.map((store, index) => {
                    const score = (store as any)._score ?? 0;
                    const meters = parseDistanceToMeters(store.distance);

                    return (
                      <motion.div
                        key={store.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.04 }}
                        onClick={() => setSelectedRestaurant(store)}
                        className="flex gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm cursor-pointer transition-all hover:border-gray-300 hover:shadow-md active:scale-[0.99]"
                      >
                        <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-gray-100">
                          <img
                            src={store.image || "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=400&q=80"}
                            alt={store.name}
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.src = "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=400&q=80";
                            }}
                          />
                          <div className="absolute top-1 left-1 rounded-full bg-teal-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                            NEW
                          </div>
                          <div className="absolute bottom-1 right-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white">
                            #{index + 1}
                          </div>
                        </div>

                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <h2 className="truncate text-sm font-semibold text-gray-900">
                              {store.name}
                            </h2>
                            <div className="flex items-center gap-1 text-[11px] text-gray-500">
                              <Star className="h-3 w-3 text-amber-400" />
                              <span>{score.toFixed(1)}</span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                            <span className="font-medium text-gray-800">
                              {store.cuisine}
                            </span>
                            <span className="text-gray-400">•</span>
                            <span>{store.spiceLevel}</span>
                            <span className="text-gray-400">•</span>
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {formatDistanceInMiles(meters)}
                            </span>
                            {typeof store.rating === "number" && (
                              <>
                                <span className="text-gray-400">•</span>
                                <span>
                                  {store.rating.toFixed(1)}{" "}
                                  <span className="text-[11px] text-gray-500">
                                    ({store.ratingCount ?? 0} reviews)
                                  </span>
                                </span>
                              </>
                            )}
                          </div>

                          <p className="line-clamp-2 text-xs text-gray-600">
                            {store.description}
                          </p>

                          <div className="flex flex-wrap gap-1.5 pt-0.5">
                            {store.specialties.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-700"
                              >
                                {tag}
                              </span>
                            ))}
                            {meters != null && meters > 8047 && (
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">
                                A bit far
                              </span>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}


      {/* Bottom Navigation Bar */}
      {!showSaved && (
        <div className="pb-safe-bottom absolute inset-x-0 bottom-0 z-20 px-6 pb-4">
          <div className="bg-white/95 backdrop-blur-xl rounded-3xl px-6 py-4 shadow-2xl border border-white/20">
            <div className="flex items-center justify-around">
              {/* Home */}
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={() => setActiveTab("home")}
                className="flex flex-col items-center gap-1.5 relative"
              >
                <div className={`absolute inset-0 -top-3 -bottom-3 -left-6 -right-6 rounded-full transition-colors ${
                  activeTab === "home" ? "bg-gray-100" : ""
                }`} />
                <div className="relative z-10">
                  <HomeIcon className={`h-6 w-6 transition-colors ${
                    activeTab === "home" ? "text-gray-900" : "text-gray-500"
                  }`} />
                </div>
                <span className={`text-xs relative z-10 transition-colors ${
                  activeTab === "home" ? "text-gray-900 font-medium" : "text-gray-500"
                }`}>
                  Home
                </span>
              </motion.button>

              {/* Discover */}
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={() => setActiveTab("discover")}
                className="flex flex-col items-center gap-1.5 relative"
              >
                <div className={`absolute inset-0 -top-3 -bottom-3 -left-6 -right-6 rounded-full transition-colors ${
                  activeTab === "discover" ? "bg-gray-100" : ""
                }`} />
                <div className="relative z-10">
                  <div className={`h-7 w-7 flex items-center justify-center rounded-lg transition-all ${
                    activeTab === "discover" 
                      ? "bg-gray-900 text-white shadow-md" 
                      : "bg-gray-100 text-gray-500"
                  }`}>
                    <span className="text-lg font-bold" style={{ 
                      fontFamily: 'sans-serif', 
                      letterSpacing: '-0.03em',
                      lineHeight: '1'
                    }}>
                      H
                    </span>
                  </div>
                </div>
                <span className={`text-xs relative z-10 transition-colors ${
                  activeTab === "discover" ? "text-gray-900 font-medium" : "text-gray-500"
                }`}>
                  Discover
                </span>
              </motion.button>

              {/* Recommendations */}
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={() => setActiveTab("recommendations")}
                className="flex flex-col items-center gap-1.5 relative"
              >
                <div className={`absolute inset-0 -top-3 -bottom-3 -left-6 -right-6 rounded-full transition-colors ${
                  activeTab === "recommendations" ? "bg-gray-100" : ""
                }`} />
                <div className="relative z-10">
                  <UtensilsCrossed className={`h-6 w-6 transition-colors ${
                    activeTab === "recommendations" ? "text-gray-900" : "text-gray-500"
                  }`} />
                </div>
                <span className={`text-xs relative z-10 transition-colors ${
                  activeTab === "recommendations" ? "text-gray-900 font-medium" : "text-gray-500"
                }`}>
                  For You
                </span>
              </motion.button>

              {/* History */}
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={() => setActiveTab("history")}
                className="flex flex-col items-center gap-1.5 relative"
              >
                <div className={`absolute inset-0 -top-3 -bottom-3 -left-6 -right-6 rounded-full transition-colors ${
                  activeTab === "history" ? "bg-gray-100" : ""
                }`} />
                <div className="relative z-10">
                  <History className={`h-6 w-6 transition-colors ${
                    activeTab === "history" ? "text-gray-900" : "text-gray-500"
                  }`} />
                </div>
                <span className={`text-xs relative z-10 transition-colors ${
                  activeTab === "history" ? "text-gray-900 font-medium" : "text-gray-500"
                }`}>
                  History
                </span>
              </motion.button>
            </div>
          </div>
        </div>
      )}

      {/* Restaurant Detail Modal */}
      <AnimatePresence>
        {selectedRestaurant && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedRestaurant(null)}
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            />

            {/* Modal - optimized for full screen and mobile */}
            <motion.div
              initial={{ opacity: 0, y: "100%" }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed inset-0 sm:inset-x-2 sm:inset-y-4 sm:top-2 sm:bottom-2 z-50 overflow-y-auto bg-white sm:rounded-3xl border border-gray-200 shadow-2xl"
            >
              <div className="relative min-h-full">
                {/* Close button - sticky on mobile */}
                <button
                  onClick={() => setSelectedRestaurant(null)}
                  className="sticky top-4 right-4 z-20 ml-auto mt-4 mr-4 sm:absolute sm:mt-0 p-2.5 rounded-full bg-white/95 backdrop-blur-sm text-gray-700 hover:bg-gray-100 transition-colors shadow-lg"
                >
                  <X className="h-5 w-5 sm:h-6 sm:w-6" />
                </button>

                {/* Cover image - larger on mobile */}
                <div className="relative h-72 sm:h-80 w-full overflow-hidden">
                  <img
                    src={selectedRestaurant.image || "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80"}
                    alt={selectedRestaurant.name}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80";
                    }}
                  />
                </div>

                {/* Content - responsive padding */}
                <div className="p-4 sm:p-6 pb-8 space-y-4 sm:space-y-5">
                  <div>
                    <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2 sm:mb-3">
                      {selectedRestaurant.name}
                    </h2>
                    <div className="flex items-center gap-2 sm:gap-3 flex-wrap text-sm sm:text-base">
                      <span className="font-medium text-gray-700">
                        {selectedRestaurant.cuisine}
                      </span>
                      <span className="text-gray-400">•</span>
                      <span className="font-medium text-gray-700">
                        {selectedRestaurant.spiceLevel}
                      </span>
                      <span className="text-gray-400">•</span>
                      <span className="flex items-center gap-1 text-gray-600">
                        <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        {formatDistanceInMiles(parseDistanceToMeters(selectedRestaurant.distance))}
                      </span>
                    </div>
                  </div>

                  <p className="text-sm sm:text-base leading-relaxed text-gray-700">
                    {selectedRestaurant.description}
                  </p>

                  {/* Additional info - responsive grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-2 gap-3 sm:gap-4 pt-2">
                    {selectedRestaurant.rating && (
                      <div className="bg-gray-50 rounded-xl p-3 sm:p-4 border border-gray-200">
                        <p className="text-xs text-gray-600 mb-1.5">Rating</p>
                        <p className="text-lg sm:text-xl font-semibold text-gray-900">
                          {selectedRestaurant.rating.toFixed(1)} ⭐
                        </p>
                        {selectedRestaurant.ratingCount && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {selectedRestaurant.ratingCount.toLocaleString()} reviews
                          </p>
                        )}
                      </div>
                    )}
                    {selectedRestaurant.priceLevel !== undefined && (
                      <div className="bg-gray-50 rounded-xl p-3 sm:p-4 border border-gray-200">
                        <p className="text-xs text-gray-600 mb-1.5">Price</p>
                        <p className="text-lg sm:text-xl font-semibold text-gray-900">
                          {"$".repeat(Math.max(1, Math.min(4, (selectedRestaurant.priceLevel ?? 0) + 1)))}
                        </p>
                      </div>
                    )}
                    {selectedRestaurant.phone && (
                      <div className="bg-gray-50 rounded-xl p-3 sm:p-4 border border-gray-200">
                        <p className="text-xs text-gray-600 mb-1.5">Phone</p>
                        <a
                          href={`tel:${selectedRestaurant.phone}`}
                          className="text-sm sm:text-base text-teal-600 hover:text-teal-700 break-all"
                        >
                          {selectedRestaurant.phone}
                        </a>
                      </div>
                    )}
                    {selectedRestaurant.website && (
                      <div className="bg-gray-50 rounded-xl p-3 sm:p-4 border border-gray-200">
                        <p className="text-xs text-gray-600 mb-1.5">Website</p>
                        <a
                          href={selectedRestaurant.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm sm:text-base text-teal-600 hover:text-teal-700 break-all block"
                        >
                          Visit website
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Opening hours */}
                  {selectedRestaurant.openingHours?.weekdayText && (
                    <div className="bg-gray-50 rounded-xl p-4 sm:p-5 border border-gray-200">
                      <p className="text-sm sm:text-base font-semibold text-gray-900 mb-3">
                        {selectedRestaurant.openingHours.openNow ? (
                          <span className="text-teal-600">Open now</span>
                        ) : (
                          <span className="text-red-600">Closed now</span>
                        )}
                      </p>
                      <div className="space-y-1.5">
                        {selectedRestaurant.openingHours.weekdayText?.map((day: string, idx: number) => (
                          <p key={idx} className="text-xs sm:text-sm text-gray-600">
                            {day}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Gallery */}
                  {(() => {
                    const photos = [
                      selectedRestaurant.image,
                      ...(selectedRestaurant.gallery ?? []).slice(0, 3),
                    ].filter(Boolean) as string[];

                    if (photos.length === 0) return null;

                    return (
                      <div className="space-y-3">
                        <p className="text-sm sm:text-base font-semibold text-gray-900">
                          Photos ({photos.length})
                        </p>
                        <div className="flex gap-2 sm:gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
                          {photos.map((photo, idx) => (
                            <div
                              key={idx}
                              className="flex-shrink-0 relative group"
                            >
                              <img
                                src={photo}
                                alt={`${selectedRestaurant.name} photo ${idx + 1}`}
                                className="h-48 sm:h-56 w-auto object-cover rounded-lg shadow-sm border border-gray-200 transition-transform duration-200 group-hover:scale-105"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.src = "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=400&q=80";
                                }}
                              />
                              {idx === 0 && (
                                <span className="absolute top-2 left-2 bg-black/60 text-white text-xs font-medium px-2 py-1 rounded-full backdrop-blur-sm">
                                  Cover
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Specialties */}
                  {selectedRestaurant.specialties && selectedRestaurant.specialties.length > 0 && (
                    <div className="flex flex-wrap gap-2 sm:gap-2.5 pt-2">
                      {selectedRestaurant.specialties.map((specialty) => (
                        <span
                          key={specialty}
                          className="rounded-full bg-gray-100 px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium text-gray-700"
                        >
                          {specialty}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Saved restaurants modal */}
      <AnimatePresence>
        {showSaved && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSaved(false)}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            />

            {/* Modal */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 260 }}
              className="fixed inset-x-0 bottom-0 top-20 z-50 flex flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl border-t border-gray-200"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-5 bg-white">
                <div>
                  <div className="mb-1 flex items-center gap-2.5">
                    <Heart className="h-5 w-5 fill-teal-500 text-teal-500" />
                    <h2 className="text-2xl font-bold text-gray-900">
                      Saved Restaurants
                    </h2>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    {saved.length}{" "}
                    {saved.length === 1 ? "restaurant" : "restaurants"} saved
                  </p>
                </div>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowSaved(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
                >
                  <X className="h-5 w-5" />
                </motion.button>
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto px-5 py-5 bg-white">
                {saved.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center px-4 py-16">
                    <motion.div
                      animate={{ scale: [1, 1.05, 1] }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        repeatDelay: 1,
                      }}
                      className="mb-6"
                    >
                      <Heart className="h-16 w-16 fill-gray-300 text-gray-400" />
                    </motion.div>
                    <p className="mb-2 text-lg font-semibold text-gray-900">
                      No saved restaurants yet
                    </p>
                    <p className="max-w-xs text-center text-sm leading-relaxed text-gray-600">
                      Start swiping and save your favorite spots to see them
                      here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {saved.map((store, index) => (
                      <motion.div
                        key={store.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.04 }}
                        className="group flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 transition-all hover:border-gray-300 hover:shadow-md active:scale-[0.99]"
                      >
                        <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl shadow-sm">
                          <img
                            src={store.image || "/placeholder.svg"}
                            alt={store.name}
                            className="h-20 w-20 object-cover rounded-xl shadow-sm transition-transform duration-300 group-hover:scale-105"
                          />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="mb-1 text-lg font-bold text-gray-900">
                            {store.name}
                          </span>
                          <div className="mb-1.5 flex items-center gap-2 text-sm">
                            <span className="font-medium text-gray-700">
                              {store.cuisine}
                            </span>
                            <span className="text-gray-400">•</span>
                            <span className="flex items-center gap-1 text-xs text-gray-600">
                              <MapPin className="h-3.5 w-3.5" />
                              {formatDistanceInMiles(parseDistanceToMeters(store.distance))}
                            </span>
                          </div>
                          <p className="line-clamp-1 text-sm leading-relaxed text-gray-600">
                            {store.description}
                          </p>
                        </div>
                        <Heart className="h-5 w-5 flex-shrink-0 fill-teal-500/20 text-teal-500 transition-colors group-hover:fill-teal-500/30" />
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer inside modal */}
              <div className="border-t border-gray-200 px-5 py-4 bg-white">
                <div className="flex flex-col gap-2">
                  {/* Button to open the recommendations page.
                     That page reads this same saved list from localStorage
                     and runs a small scoring algorithm to rank suggestions. */}
                  <Link
                    href="/recommendations"
                    className="w-full rounded-xl border border-teal-500 px-4 py-3.5 text-sm font-semibold text-teal-600 text-center transition hover:bg-teal-50"
                  >
                    View Recommendations
                  </Link>
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={resetDeck}
                    className="w-full rounded-xl bg-teal-500 px-4 py-3.5 font-semibold text-white transition hover:bg-teal-600"
                  >
                    Reset All &amp; Start Over
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Single full-screen swipe card (no stack).
 */
type SwipeCardProps = {
  store: FoodStore;
  lastDirection: "left" | "right" | null;
  onDragEnd?: (info: DragInfo) => void;
  showCheckmark?: boolean;
};

function SwipeCard({
  store,
  lastDirection,
  onDragEnd,
  showCheckmark = false,
}: SwipeCardProps) {
  const x = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 300, damping: 30 });
  const [exitDirection, setExitDirection] = useState<"left" | "right" | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);

  const photos = [
    store.image,
    ...(store.gallery ?? []).slice(0, 3),
  ].filter(Boolean) as string[];

  useEffect(() => {
    // Reset to first photo when card changes
    setPhotoIndex(0);
  }, [store.id]);

  const rotate = useTransform(springX, [-260, 0, 260], [-16, 0, 16]);
  const saveOpacity = useTransform(springX, [40, 180], [0, 0.85]);
  const saveScale = useTransform(springX, [40, 180], [0.85, 1.08]);
  const skipOpacity = useTransform(springX, [-40, -180], [0, 0.85]);
  const skipScale = useTransform(springX, [-40, -180], [0.85, 1.08]);

  useEffect(() => {
    if (lastDirection) {
      setExitDirection(lastDirection);
    }
  }, [lastDirection]);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center px-6 pt-24 pb-32 bg-gradient-to-b from-gray-50 to-white cursor-grab active:cursor-grabbing"
      style={{
        transformOrigin: "center",
        zIndex: 10,
        x: springX,
        rotate,
        willChange: "transform",
      }}
      initial={{ opacity: 0, y: 80, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{
        opacity: 0,
        rotate: exitDirection === "right" ? 20 : exitDirection === "left" ? -20 : 0,
        x: exitDirection === "right" ? 800 : exitDirection === "left" ? -800 : 0,
        scale: 0.9,
        transition: {
          type: "spring",
          stiffness: 230,
          damping: 26,
          mass: 0.5,
        },
      }}
      drag="x"
      dragElastic={0.12}
      dragSnapToOrigin={true}
      dragConstraints={{ left: -400, right: 400 }}
      dragTransition={{ bounceStiffness: 300, bounceDamping: 30 }}
      onDragEnd={
        onDragEnd
          ? (_event, info) => {
              // onDragEnd only fires when gesture completes (finger lifted)
              // Equivalent to checking state === 5 in React Native PanGestureHandler
              const swipeVelocity = info.velocity.x;
              const swipeDistance = info.offset.x;
              
              // Check if swipe threshold was met - prioritize distance, then velocity
              // Swipe right: positive distance threshold OR (positive velocity AND positive distance)
              const isSwipeRight =
                swipeDistance > SWIPE_THRESHOLD ||
                (swipeVelocity > SWIPE_VELOCITY_THRESHOLD && swipeDistance > 0);
              
              // Swipe left: negative distance threshold OR (negative velocity AND negative distance)
              const isSwipeLeft =
                swipeDistance < -SWIPE_THRESHOLD ||
                (swipeVelocity < -SWIPE_VELOCITY_THRESHOLD && swipeDistance < 0);

              // Only reset if swipe wasn't completed
              // If swipe was completed, the card will exit and a new one will appear
              if (!isSwipeRight && !isSwipeLeft) {
                // Smoothly spring back to center if swipe wasn't completed
                x.set(0);
              }

              // Determine exit direction from drag info before passing to parent
              if (isSwipeRight) {
                setExitDirection("right");
              } else if (isSwipeLeft) {
                setExitDirection("left");
              }

              // Pass to parent handler for decision logic
              onDragEnd({
                offset: info.offset,
                velocity: info.velocity,
              });
            }
          : undefined
      }
      whileDrag={{
        scale: 1.02,
        transition: { duration: 0.15 },
      }}
    >
      {/* Centered modal-style card sized to fill the screen area */}
      <article
        className="pointer-events-auto relative h-full w-full max-w-md sm:max-w-lg overflow-hidden rounded-3xl bg-black shadow-[0_20px_40px_rgba(15,23,42,0.25)]"
        onClick={() => {
          // Only treat as tap if the card isn't currently swiped far in X
          if (Math.abs(x.get()) < 10 && photos.length > 1) {
            setPhotoIndex((prev) => (prev + 1) % photos.length);
          }
        }}
      >
        {/* SAVE overlay */}
        <motion.div
          className="absolute inset-0 z-30 flex items-center justify-center bg-teal-500/20 backdrop-blur-sm pointer-events-none"
          style={{ opacity: saveOpacity }}
        >
          <motion.div
            className="flex flex-col items-center gap-2"
            style={{ scale: saveScale }}
          >
            <div className="h-24 w-24 rounded-full bg-teal-500 flex items-center justify-center shadow-2xl">
              <Check className="h-12 w-12 text-white stroke-[3]" />
            </div>
            <span className="text-xl font-bold text-white">
              SAVE
            </span>
          </motion.div>
        </motion.div>

        {/* SKIP overlay */}
        <motion.div
          className="absolute inset-0 z-30 flex items-center justify-center bg-red-500/20 backdrop-blur-sm pointer-events-none"
          style={{ opacity: skipOpacity }}
        >
          <motion.div
            className="flex flex-col items-center gap-2"
            style={{ scale: skipScale }}
          >
            <div className="h-24 w-24 rounded-full bg-red-500 flex items-center justify-center shadow-2xl">
              <X className="h-12 w-12 text-white stroke-[3]" />
            </div>
            <span className="text-xl font-bold text-white">
              SKIP
            </span>
          </motion.div>
        </motion.div>

        {/* Teal Checkmark Overlay */}
        <AnimatePresence>
          {showCheckmark && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.2 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none"
            >
              <div className="h-32 w-32 rounded-full bg-teal-500 flex items-center justify-center shadow-2xl">
                <Check className="h-16 w-16 text-white stroke-[4]" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Single hero image */}
        <div className="absolute inset-0">
          <img
            src={photos[photoIndex] || "/placeholder.svg"}
            alt={store.name}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

          {/* Top-left distance chip */}
          <div className="absolute top-4 left-4 flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1 text-xs text-white/90 backdrop-blur-sm">
            <MapPin className="h-3 w-3" />
            <span>{formatDistanceInMiles(parseDistanceToMeters(store.distance))}</span>
          </div>

          {/* Content overlay */}
          <div className="absolute inset-x-0 bottom-0 p-5 pb-6 text-white space-y-3">
            {store.isNew && (
              <span className="text-xs font-medium text-white/90 tracking-wide">
                NEW SPOT
              </span>
            )}

            <div>
              <h2 className="mb-1.5 text-2xl font-bold leading-tight">
                {store.name}
              </h2>
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-white/90">
                  {store.cuisine}
                </span>
                <span className="text-white/70">•</span>
                <span className="font-medium text-white/90">
                  {store.spiceLevel}
                </span>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-white/85 line-clamp-2">
              {store.description}
            </p>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                {store.specialties.slice(0, 3).map((specialty) => (
                  <span
                    key={specialty}
                    className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-medium backdrop-blur-sm"
                  >
                    {specialty}
                  </span>
                ))}
              </div>

              {/* Small hint to open photo modal */}
              {photos.length > 1 && (
                <span className="text-[11px] text-white/80">
                  Tap card to view {photos.length} photos
                </span>
              )}
            </div>
          </div>
        </div>
      </article>
    </motion.div>
  );
}
