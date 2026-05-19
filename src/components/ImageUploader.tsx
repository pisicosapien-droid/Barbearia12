
import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { Image as ImageIcon, Upload, X, Check } from 'lucide-react';
import { getCroppedImg } from '../lib/cropImage';

interface ImageUploaderProps {
  onImageCropped: (dataUrl: string) => void;
  aspectRatio?: number;
  label?: string;
  initialImage?: string;
}

export function ImageUploader({ onImageCropped, aspectRatio = 16 / 9, label = "Upload Imagem", initialImage }: ImageUploaderProps) {
  const [image, setImage] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [isCropping, setIsCropping] = useState(false);

  const onCropComplete = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        setImage(reader.result as string);
        setIsCropping(true);
      });
      reader.readAsDataURL(file);
    }
  };

  const showCroppedImage = useCallback(async () => {
    try {
      if (image && croppedAreaPixels) {
        const croppedImage = await getCroppedImg(image, croppedAreaPixels);
        onImageCropped(croppedImage);
        setIsCropping(false);
        setImage(null);
      }
    } catch (e) {
      console.error(e);
    }
  }, [image, croppedAreaPixels, onImageCropped]);

  return (
    <div className="w-full">
      <label className="text-[9px] uppercase tracking-widest text-white/30 mb-2 block font-bold">{label}</label>
      
      {!isCropping ? (
        <div className="flex gap-4 items-center">
          <label className="flex-1 flex flex-col items-center justify-center p-4 border border-dashed border-white/20 rounded-sm hover:border-gold hover:text-gold transition-all cursor-pointer group bg-black/20">
            <Upload className="w-5 h-5 mb-1 opacity-40 group-hover:opacity-100" />
            <span className="text-[9px] font-bold uppercase tracking-widest opacity-40 group-hover:opacity-100">Selecionar arquivo</span>
            <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
          </label>
          
          {(initialImage || image) && (
            <div className="w-20 h-12 bg-white/5 rounded-sm overflow-hidden border border-white/10 shrink-0">
               <img src={initialImage || image || ""} className="w-full h-full object-cover" />
            </div>
          )}
        </div>
      ) : (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-4">
          <div className="relative w-full max-w-2xl aspect-square bg-zinc-900 rounded-sm overflow-hidden">
            <Cropper
              image={image || ""}
              crop={crop}
              zoom={zoom}
              aspect={aspectRatio}
              onCropChange={setCrop}
              onCropComplete={onCropComplete}
              onZoomChange={setZoom}
            />
          </div>
          
          <div className="mt-8 w-full max-w-2xl space-y-6">
            <div className="px-4">
               <label className="text-[9px] uppercase tracking-widest text-white/40 block mb-2 font-bold">Zoom</label>
               <input
                 type="range"
                 value={zoom}
                 min={1}
                 max={3}
                 step={0.1}
                 aria-labelledby="Zoom"
                 onChange={(e) => setZoom(Number(e.target.value))}
                 className="w-full accent-gold bg-white/10 h-1 rounded-full appearance-none cursor-pointer"
               />
            </div>
            
            <div className="flex gap-4">
              <button
                onClick={() => {
                  setIsCropping(false);
                  setImage(null);
                }}
                className="flex-1 py-4 bg-white/5 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 transition-all flex items-center justify-center gap-2"
              >
                <X className="w-4 h-4" /> Cancelar
              </button>
              <button
                onClick={showCroppedImage}
                className="flex-1 py-4 bg-gold text-black text-[10px] font-bold uppercase tracking-widest hover:bg-white transition-all flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" /> Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
