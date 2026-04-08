"use client"

import { useEffect, useState } from "react"
import { fetchLocalWeather } from "@/src/lib/weather"
import { Sun, Thermometer, Droplets, Loader2, MapPin, AlertCircle, CloudRain, ShieldCheck, Waves } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card"
import { Button } from "@/src/components/ui/button"

interface WeatherData {
  temperatureMin: number
  temperatureMax: number
  humidity: number
  precipitationProbability: number
}

export function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState<string>("")

  // Thresholds
  const HEAT_THRESHOLD = 33
  const RAIN_THRESHOLD = 40

  // Fetch only occasionally
  const loadWeather = () => {
    setLoading(true)
    setError(null)
    
    if (!navigator.geolocation) {
      setError("Geolocalisation non supportee")
      setLoading(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const data = await fetchLocalWeather(position.coords.latitude, position.coords.longitude)
          if (data) {
            setWeather(data)
          } else {
            setError("Donnees meteo indisponibles")
          }
        } catch {
          setError("Erreur reseau")
        } finally {
          setLoading(false)
        }
      },
      () => {
        setError("Acces GPS refuse")
        setLoading(false)
      }
    )
  }

  useEffect(() => {
    loadWeather()

    // Setup an interval to update the fake "current time" for the dashboard feel
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString("fr-SN", { hour: "2-digit", minute: "2-digit" }))
    }, 60000)
    
    setCurrentTime(new Date().toLocaleTimeString("fr-SN", { hour: "2-digit", minute: "2-digit" }))
    
    return () => clearInterval(timer)
  }, [])

  return (
    <Card className="overflow-hidden border-orange-100 bg-gradient-to-br from-orange-50 to-amber-50">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-orange-900 flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          Ferme Locale
        </CardTitle>
        <span className="text-xs font-semibold text-orange-600 bg-orange-100 px-2 py-1 rounded-full">
          {currentTime || "--:--"}
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-6 text-orange-500">
            <Loader2 className="h-6 w-6 animate-spin mb-2" />
            <p className="text-sm">Recuperation de la meteo...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <AlertCircle className="h-8 w-8 text-orange-400 mb-2" />
            <p className="text-sm text-orange-800 font-medium mb-3">{error}</p>
            <Button variant="outline" size="sm" onClick={loadWeather} className="bg-white/50 text-orange-700 hover:bg-white border-orange-200">
              Reessayer
            </Button>
          </div>
        ) : weather ? (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-orange-500 rounded-2xl text-white shadow-sm">
                  {weather.precipitationProbability > RAIN_THRESHOLD ? (
                    <CloudRain className="h-8 w-8" />
                  ) : (
                    <Sun className="h-8 w-8" />
                  )}
                </div>
                <div>
                  <div className="text-3xl font-bold text-orange-950">
                    {Math.round((weather.temperatureMax + weather.temperatureMin) / 2)}°C
                  </div>
                  <p className="text-xs font-medium text-orange-700">Aujourd&apos;hui</p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5 text-sm text-orange-800 bg-white/50 px-2.5 py-1 rounded-lg">
                  <Thermometer className="h-3.5 w-3.5 text-orange-600" />
                  <span className="font-semibold">{weather.temperatureMax}°</span>
                  <span className="text-orange-500">/</span>
                  <span className="text-orange-600">{weather.temperatureMin}°</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-orange-800 bg-white/50 px-2.5 py-1 rounded-lg">
                  <Droplets className="h-3.5 w-3.5 text-blue-500" />
                  <span className="font-semibold">{weather.humidity}% <span className="text-xs font-normal">hum.</span></span>
                </div>
              </div>
            </div>

            {/* Section Conseils Inteligens */}
            <div className="space-y-2 pt-2 border-t border-orange-100">
              <p className="text-[10px] font-bold uppercase tracking-wider text-orange-400">Conseils de l&apos;IA SunuFarm</p>
              
              {weather.temperatureMax > HEAT_THRESHOLD && (
                <div className="flex gap-2 p-2 rounded-lg bg-red-50 border border-red-100 items-start">
                  <Waves className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <div className="text-xs text-red-900">
                    <span className="font-bold">Alerte chaleur :</span> Assurez une hydratation maximale (eau fraîche) et activez la ventilation/extracteurs pour éviter le stress thermique.
                  </div>
                </div>
              )}

              {weather.precipitationProbability > RAIN_THRESHOLD && (
                <div className="flex gap-2 p-2 rounded-lg bg-blue-50 border border-blue-100 items-start">
                  <ShieldCheck className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                  <div className="text-xs text-blue-900">
                    <span className="font-bold">Risque de pluie :</span> Vérifiez l&apos;étanchéité des toitures et les protections latérales du poulailler avant l&apos;arrivée de l&apos;averse.
                  </div>
                </div>
              )}

              {weather.temperatureMax <= HEAT_THRESHOLD && weather.precipitationProbability <= RAIN_THRESHOLD && (
                <div className="flex gap-2 p-2 rounded-lg bg-green-50 border border-green-100 items-start">
                  <ShieldCheck className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                  <div className="text-xs text-green-900">
                    Conditions ideales aujourd&apos;hui. Maintenez vos protocoles sanitaires habituels.
                  </div>
                </div>
              )}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
