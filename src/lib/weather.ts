export interface WeatherResponse {
  temperatureMin: number;
  temperatureMax: number;
  humidity: number;
  precipitationProbability: number;
}

/**
 * Fetch local weather from Open-Meteo API using given latitude and longitude.
 * @param lat 
 * @param lon 
 * @returns Weather data or null if an error occurs
 */
export async function fetchLocalWeather(lat: number, lon: number, targetDate?: string): Promise<WeatherResponse | null> {
  try {
    const roundedLat = Math.round(lat * 10000) / 10000;
    const roundedLon = Math.round(lon * 10000) / 10000;
    
    let url = `https://api.open-meteo.com/v1/forecast?latitude=${roundedLat}&longitude=${roundedLon}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto`;
    
    // For past days or a specific requested day, we enforce start_date and end_date.
    // Note: start_date/end_date is mutually exclusive with past_days.
    if (targetDate) {
      url += `&start_date=${targetDate}&end_date=${targetDate}`;
    } else {
      url += `&current=relative_humidity_2m`;
    }

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error('Failed to fetch weather data');
    }

    const data = await response.json();

    return {
      temperatureMin: data.daily.temperature_2m_min[0],
      temperatureMax: data.daily.temperature_2m_max[0],
      humidity: data.current?.relative_humidity_2m ?? 0,
      precipitationProbability: data.daily.precipitation_probability_max?.[0] ?? 0
    };
  } catch (error) {
    console.error('Error fetching weather:', error);
    return null;
  }
}
