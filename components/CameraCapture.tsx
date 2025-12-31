
import React, { useRef, useState, useEffect } from 'react';

interface CameraCaptureProps {
  onCapture: (base64: string) => void;
  label: string;
}

const CameraCapture: React.FC<CameraCaptureProps> = ({ onCapture, label }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [showFlash, setShowFlash] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        
        // Trigger flash effect
        setShowFlash(true);
        setTimeout(() => setShowFlash(false), 300);

        setPreview(base64);
        onCapture(base64.split(',')[1]); // Send just the base64 data
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="flex flex-col items-center gap-6 w-full relative">
      {/* Flash Effect Overlay */}
      {showFlash && (
        <div className="fixed inset-0 bg-white z-[100] animate-out fade-out duration-300 pointer-events-none"></div>
      )}

      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileChange}
      />
      
      {!preview ? (
        <button
          onClick={triggerInput}
          className="w-full py-16 border border-plantin-sage/40 rounded-[2.5rem] bg-white shadow-sm hover:shadow-md transition-all flex flex-col items-center justify-center gap-4 text-plantin-deep group"
        >
          <div className="w-20 h-20 rounded-full bg-plantin-soft flex items-center justify-center text-3xl group-hover:scale-110 transition-transform duration-300">
            <i className="fas fa-camera-retro text-plantin-leaf animate-pulse text-4xl"></i>
          </div>
          <div className="text-center">
            <span className="font-serif font-semibold text-2xl block mb-1">{label}</span>
            <p className="text-sm text-stone-400 font-medium">Capture or upload your plant</p>
          </div>
        </button>
      ) : (
        <div className="relative w-full aspect-[4/5] rounded-[3rem] overflow-hidden shadow-2xl border-8 border-white group animate-in zoom-in-95 duration-300">
          <img src={preview} alt="Preview" className="w-full h-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black/50 to-transparent">
            <button
              onClick={() => { setPreview(null); triggerInput(); }}
              className="w-full bg-white/95 backdrop-blur-md text-plantin-deep py-4 rounded-2xl shadow-xl text-sm font-bold uppercase tracking-widest hover:bg-white transition-all flex items-center justify-center gap-2"
            >
              <i className="fas fa-redo text-lg"></i> Try Another Photo
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CameraCapture;
