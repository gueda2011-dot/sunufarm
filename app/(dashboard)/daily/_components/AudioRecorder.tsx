"use client"

import { useState, useRef } from "react"
import { Mic, Square, Loader2, Play, Trash2 } from "lucide-react"
import { Button } from "@/src/components/ui/button"
import { toast } from "sonner"

interface AudioRecorderProps {
  onAudioUploaded: (url: string | null) => void
  existingAudioUrl?: string | null
  organizationId: string
  batchId: string
  disabled?: boolean
}

export function AudioRecorder({
  onAudioUploaded,
  existingAudioUrl,
  organizationId,
  batchId,
  disabled
}: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(existingAudioUrl || null)
  const [isUploading, setIsUploading] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" })
        stream.getTracks().forEach((track) => track.stop())
        await handleUpload(audioBlob)
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (error) {
      console.error("Error accessing microphone:", error)
      toast.error("Impossible d'accéder au microphone. Vérifiez vos permissions.")
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const handleUpload = async (blob: Blob) => {
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
    const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET

    if (!cloudName || !uploadPreset) {
      toast.error("Cloudinary n'est pas configuré (.env manquant).")
      return
    }

    try {
      setIsUploading(true)
      
      const formData = new FormData()
      formData.append("file", blob)
      formData.append("upload_preset", uploadPreset)
      formData.append("folder", `sunufarm/daily/${organizationId}/${batchId}`)
      
      // L'endpoint "video" gère aussi les formats audio
      const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/video/upload`, {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error("Erreur serveur lors de l'upload")
      }

      const data = await response.json()
      const downloadURL = data.secure_url
      
      setAudioUrl(downloadURL)
      onAudioUploaded(downloadURL)
      
      setIsUploading(false)
      toast.success("Note vocale enregistrée")
    } catch (error) {
      console.error("Cloudinary error:", error)
      toast.error("Erreur lors de l'envoi de l'audio. Vérifiez votre Upload Preset.")
      setIsUploading(false)
    }
  }

  const clearAudio = () => {
    setAudioUrl(null)
    onAudioUploaded(null)
  }

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/50 p-4">
      <div className="flex items-center justify-between">
        <div>
          <label className="block text-sm font-medium text-gray-700">Note Vocale</label>
          <p className="text-xs text-gray-500">Parlez directement pour enregistrer vos observations (Wolof, etc.)</p>
        </div>
        
        {audioUrl ? (
          <Button type="button" variant="ghost" size="sm" onClick={clearAudio} className="text-red-600 hover:text-red-700 hover:bg-red-50">
            <Trash2 className="h-4 w-4 mr-1.5" />
            Supprimer
          </Button>
        ) : isRecording ? (
          <Button type="button" variant="danger" size="sm" onClick={stopRecording} className="animate-pulse">
            <Square className="h-4 w-4 mr-1.5 fill-current" />
            Arrêter
          </Button>
        ) : (
          <Button 
            type="button" 
            variant="outline" 
            size="sm" 
            onClick={startRecording} 
            disabled={disabled || isUploading}
            className="border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Mic className="h-4 w-4 mr-1.5" />
            )}
            {isUploading ? "Envoi..." : "Enregistrer"}
          </Button>
        )}
      </div>

      {audioUrl && (
        <div className="mt-3">
          <audio controls src={audioUrl} className="w-full h-10" />
        </div>
      )}
    </div>
  )
}
