"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Heart, MapPin, Star, Loader2 } from "lucide-react";
import Link from "next/link";

// This type matches the shape we already use on the main page.
// Keeping it identical means we can reuse the saved data safely.
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
};

// Cache for parsed distances to avoid re-parsing the same strings
const distanceCache = new Map<string, number | null>();

// Very fast helper: turn a string like "1.2 km away" or "800 m away"
// into a distance in meters that we can sort and score with.
// Uses caching for performance.
function parseDistanceToMeters(distance: string): number | null {
  if (!distance) return null;
  
  // Check cache first
  if (distanceCache.has(distance)) {
    return distanceCache.get(distance)!;
  }
  
  const lower = distance.toLowerCase();
  const num = parseFloat(lower);
  if (Number.isNaN(num)) {
    distanceCache.set(distance, null);
    return null;
  }

  let result: number | null = null;
  if (lower.includes("km")) {
    result = num * 1000;
  } else if (lower.includes("m")) {
    result = num;
  }
  
  distanceCache.set(distance, result);
  return result;
}

// User preferences extracted from saved restaurants
type UserPreferences = {
  favoriteCuisines: Record<string, number>; // cuisine -> count
  avgRating: number; // average rating of saved places
  avgDistance: number; // average distance in meters
  preferredPriceLevels: Record<number, number>; // price level -> count
  preferredSpiceLevels: Record<string, number>; // spice level -> count
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
    // Count cuisines
    if (store.cuisine) {
      cuisineCounts[store.cuisine] = (cuisineCounts[store.cuisine] || 0) + 1;
    }

    // Count price levels
    if (typeof store.priceLevel === "number") {
      priceCounts[store.priceLevel] = (priceCounts[store.priceLevel] || 0) + 1;
    }

    // Count spice levels
    if (store.spiceLevel) {
      spiceCounts[store.spiceLevel] = (spiceCounts[store.spiceLevel] || 0) + 1;
    }

    // Average rating
    if (typeof store.rating === "number" && store.rating > 0) {
      totalRating += store.rating;
      ratingCount++;
    }

    // Average distance
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

// Advanced recommendation scoring: how well does this NEW restaurant match user preferences?
function scoreRecommendation(
  restaurant: FoodStore,
  preferences: UserPreferences,
): number {
  let score = 0;

  // 1) CUISINE MATCH (highest weight - if user loves Italian, recommend Italian)
  const cuisine = restaurant.cuisine || "";
  const cuisineCount = preferences.favoriteCuisines[cuisine] || 0;
  if (cuisineCount > 0) {
    // Strong boost for favorite cuisines
    // If user saved 3+ of this cuisine, it's a strong preference
    const cuisineWeight = cuisineCount >= 3 ? 25 : cuisineCount * 8;
    score += cuisineWeight;
  } else if (preferences.totalSaved > 0) {
    // Small penalty for cuisines user hasn't tried yet (but not too harsh)
    score -= 2;
  }

  // 2) RATING MATCH (recommend places similar to what they like)
  if (typeof restaurant.rating === "number" && restaurant.rating > 0) {
    if (preferences.avgRating > 0) {
      // If user likes highly rated places (avg > 4.0), boost high-rated recommendations
      const ratingDiff = Math.abs(restaurant.rating - preferences.avgRating);
      if (ratingDiff < 0.5) {
        score += 20; // Very close match
      } else if (ratingDiff < 1.0) {
        score += 12; // Close match
      } else {
        score += 5; // Still acceptable
      }

      // Extra boost for highly rated places if user prefers them
      if (preferences.avgRating >= 4.0 && restaurant.rating >= 4.5) {
        score += 8;
      }
    } else {
      // No preference yet, just boost good ratings
      score += restaurant.rating * 3;
    }

    // Social proof boost
    if (restaurant.ratingCount && restaurant.ratingCount > 100) {
      score += Math.min(restaurant.ratingCount / 300, 3);
    }
  }

  // 3) DISTANCE MATCH (recommend places at similar distances they prefer)
  const meters = parseDistanceToMeters(restaurant.distance);
  if (meters != null && Number.isFinite(meters) && meters > 0) {
    if (preferences.avgDistance > 0) {
      // If user prefers close places (avg < 1km), prioritize close recommendations
      const distanceDiff = Math.abs(meters - preferences.avgDistance);
      if (distanceDiff < 500) {
        score += 15; // Very similar distance
      } else if (distanceDiff < 1000) {
        score += 10; // Similar distance
      }

      // If user prefers close places, boost close recommendations
      if (preferences.avgDistance < 1000 && meters < 1500) {
        score += 12;
      }
    }

    // Always boost close places (but less if user prefers farther)
    if (meters < 500) {
      score += 10;
    } else if (meters < 1000) {
      score += 7;
    } else if (meters < 2000) {
      score += 4;
    } else if (meters < 5000) {
      score += 1;
    }
  }

  // 4) PRICE LEVEL MATCH (recommend similar price points)
  if (typeof restaurant.priceLevel === "number") {
    const priceCount = preferences.preferredPriceLevels[restaurant.priceLevel] || 0;
    if (priceCount > 0) {
      score += priceCount * 5; // Boost for preferred price levels
    } else {
      // Small penalty for price levels user hasn't tried
      score -= 1;
    }
  }

  // 5) SPICE LEVEL MATCH (if user likes mild, recommend mild)
  const spice = restaurant.spiceLevel || "";
  const spiceCount = preferences.preferredSpiceLevels[spice] || 0;
  if (spiceCount > 0) {
    score += spiceCount * 3;
  }

  // 6) DIVERSITY BONUS (slight boost for trying new cuisines if user has many saves)
  if (preferences.totalSaved >= 5 && cuisineCount === 0) {
    score += 2; // Encourage exploration
  }

  // 7) QUALITY INDICATORS
  if (restaurant.isNew) {
    score += 3; // New spots are exciting
  }

  // 8) OPEN NOW BONUS (if available)
  if (restaurant.openingHours?.openNow) {
    score += 5; // Currently open places are more useful
  }

  return score;
}

export default function RecommendationsPage() {
  const [saved, setSaved] = useState<FoodStore[]>([]);
  const [recommendations, setRecommendations] = useState<FoodStore[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [hasLoadedCache, setHasLoadedCache] = useState(false);

  // Load saved restaurants, user location, and cached recommendations from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      // Load saved restaurants
      const savedRaw = window.localStorage.getItem("hangry_saved_restaurants");
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw) as FoodStore[];
        if (Array.isArray(parsed)) {
          setSaved(parsed);
        }
      }

      // Load user location
      const locationRaw = window.localStorage.getItem("hangry_user_location");
      if (locationRaw) {
        const location = JSON.parse(locationRaw) as { lat: number; lon: number };
        if (location.lat && location.lon) {
          setUserLocation(location);
        }
      }

      // Load cached recommendations
      const cachedRaw = window.localStorage.getItem("hangry_recommendations_cache");
      const cachedSavedCountRaw = window.localStorage.getItem("hangry_recommendations_saved_count");
      
      if (cachedRaw && cachedSavedCountRaw) {
        const cachedRecommendations = JSON.parse(cachedRaw) as FoodStore[];
        const cachedSavedCount = parseInt(cachedSavedCountRaw, 10);
        const currentSavedCount = savedRaw ? JSON.parse(savedRaw).length : 0;
        
        // Only use cache if saved count hasn't changed (user hasn't saved new restaurants)
        // This ensures recommendations stay fresh when user saves new places
        if (Array.isArray(cachedRecommendations) && cachedRecommendations.length > 0 && cachedSavedCount === currentSavedCount) {
          setRecommendations(cachedRecommendations);
          setHasLoadedCache(true);
        }
      }
    } catch (err) {
      console.error("Failed to load data from localStorage", err);
    }
  }, []);

  // Extract user preferences from saved restaurants
  const preferences = useMemo(() => extractPreferences(saved), [saved]);

  // Fetch and score NEW restaurants
  const fetchRecommendations = useCallback(async () => {
    if (!userLocation || saved.length === 0) {
      setError("Please save some restaurants first and enable location.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch nearby restaurants
      const params = new URLSearchParams({
        lat: String(userLocation.lat),
        lon: String(userLocation.lon),
        radius: "5000", // 5km radius for more options
      });

      const response = await fetch(`/api/restaurants?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch restaurants");
      }

      const data = await response.json();
      const allRestaurants = (data.restaurants || []) as FoodStore[];

      // Filter out restaurants user has already saved
      const savedIds = new Set(saved.map((s) => String(s.id)));
      const newRestaurants = allRestaurants.filter(
        (r) => !savedIds.has(String(r.id))
      );

      if (newRestaurants.length === 0) {
        setError("No new restaurants found nearby. Try expanding your search radius!");
        setLoading(false);
        return;
      }

      // Score each NEW restaurant based on user preferences
      const scored = newRestaurants.map((restaurant) => ({
        restaurant,
        score: scoreRecommendation(restaurant, preferences),
      }));

      // Sort by score (highest = best match)
      scored.sort((a, b) => {
        const scoreDiff = b.score - a.score;
        if (Math.abs(scoreDiff) > 0.1) return scoreDiff;

        // Tie-breakers
        const ratingA = a.restaurant.rating ?? 0;
        const ratingB = b.restaurant.rating ?? 0;
        if (ratingB !== ratingA) return ratingB - ratingA;

        const distA = parseDistanceToMeters(a.restaurant.distance) ?? Infinity;
        const distB = parseDistanceToMeters(b.restaurant.distance) ?? Infinity;
        return distA - distB;
      });

      // Return top recommendations (limit to 20)
      const topRecommendations = scored
        .slice(0, 20)
        .map((entry) => ({
          ...entry.restaurant,
          _score: entry.score,
        }));

      setRecommendations(topRecommendations);
      
      // Cache recommendations to localStorage for fast loading next time
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(
            "hangry_recommendations_cache",
            JSON.stringify(topRecommendations)
          );
          // Also cache the saved count to invalidate cache when user saves new restaurants
          window.localStorage.setItem(
            "hangry_recommendations_saved_count",
            String(saved.length)
          );
        } catch (err) {
          console.error("Failed to cache recommendations", err);
        }
      }
    } catch (err) {
      console.error("Error fetching recommendations:", err);
      setError("Failed to load recommendations. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [userLocation, saved, preferences]);

  // Auto-fetch recommendations when we have location and saved restaurants
  // Only fetch if we don't have cached recommendations or if saved count changed
  useEffect(() => {
    if (!userLocation || saved.length === 0) return;
    
    // Check if cache is still valid
    const cachedSavedCountRaw = typeof window !== "undefined" 
      ? window.localStorage.getItem("hangry_recommendations_saved_count")
      : null;
    const cachedSavedCount = cachedSavedCountRaw ? parseInt(cachedSavedCountRaw, 10) : 0;
    const needsRefresh = cachedSavedCount !== saved.length;
    
    // Only fetch if:
    // 1. We don't have recommendations yet AND haven't loaded from cache
    // 2. OR saved count changed (user saved new restaurants)
    if ((recommendations.length === 0 && !hasLoadedCache && !loading) || (needsRefresh && !loading)) {
      fetchRecommendations();
    }
  }, [userLocation, saved.length, recommendations.length, loading, hasLoadedCache, fetchRecommendations]);

  return (
    <div className="min-h-screen bg-white">
      {/* Top bar with back link */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-200 bg-white/95 px-5 py-4 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-700 hover:bg-gray-100"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 tracking-wide uppercase">
              Recommendations
            </h1>
            <p className="text-xs text-gray-500">
              New places tailored to your taste
            </p>
          </div>
        </div>
        <Heart className="h-5 w-5 fill-teal-500 text-teal-500" />
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-10 pt-6">
        {saved.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-gray-300 bg-gray-50 px-6 py-16 text-center">
            <p className="mb-2 text-lg font-semibold text-gray-900">
              No saved restaurants yet
            </p>
            <p className="max-w-sm text-sm text-gray-600">
              Save a few places from the Discover screen first. We&apos;ll then
              find NEW restaurants that match your taste!
            </p>
            <Link
              href="/"
              className="mt-5 rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
            >
              Back to Discover
            </Link>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400 mb-4" />
            <p className="text-sm text-gray-600">Finding perfect matches for you...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-gray-300 bg-gray-50 px-6 py-16 text-center">
            <p className="mb-2 text-lg font-semibold text-gray-900">Oops!</p>
            <p className="max-w-sm text-sm text-gray-600 mb-4">{error}</p>
            <button
              onClick={fetchRecommendations}
              className="rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
            >
              Try Again
            </button>
          </div>
        ) : recommendations.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-gray-300 bg-gray-50 px-6 py-16 text-center">
            <p className="mb-2 text-lg font-semibold text-gray-900">
              No recommendations yet
            </p>
            <p className="max-w-sm text-sm text-gray-600 mb-4">
              We&apos;re finding new places that match your preferences...
            </p>
            <button
              onClick={fetchRecommendations}
              className="rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
            >
              Refresh
            </button>
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
                  <div
                    key={store.id}
                    className="flex gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm"
                  >
                    <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-gray-100">
                      <img
                        src={store.image || "/placeholder.svg"}
                        alt={store.name}
                        className="h-full w-full object-cover"
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
                          {store.distance}
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
                        {meters != null && meters > 5000 && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">
                            A bit far
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}


