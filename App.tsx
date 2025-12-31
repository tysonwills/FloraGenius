
import React, { useState, useEffect, useMemo } from 'react';
import { Routes, Route, Link, useLocation, useNavigate, Navigate, useParams } from 'react-router-dom';
import CameraCapture from './components/CameraCapture';
import { identifyPlant, diagnosePlant, getNearbyGardenCenters, generatePlantImage, getLocalFlora } from './services/geminiService';
import { authService } from './services/authService';
import { PlantIdentification, PlantDiagnosis, GroundingSource, User, JournalEntry, PlantReminder, NotificationSettings } from './types';

// Helper to compress base64 images to prevent localStorage quota issues
const compressBase64 = async (base64: string, maxWidth = 400): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ratio = img.width / img.height;
      canvas.width = maxWidth;
      canvas.height = maxWidth / ratio;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.7)); // Compress to JPEG 70%
    };
  });
};

const DEFAULT_SETTINGS: NotificationSettings = {
  Watering: true,
  Pruning: true,
  Rotating: true,
  Fertilizing: true,
  'Mist/Clean': true,
  Repotting: true,
  Other: true
};

const PLANT_TIPS = [
  "Water your plants in the morning to allow foliage to dry before night, preventing fungal growth.",
  "Check soil moisture by sticking your finger 2 inches deep. If it's dry, it's usually time to water.",
  "Rotate your indoor plants 90 degrees every week to ensure even growth and light exposure.",
  "Wipe dust off large leaves with a damp cloth so the plant can photosynthesize efficiently.",
  "Most houseplants prefer to be slightly root-bound; only repot if roots are circling the pot.",
  "Use room-temperature water to avoid shocking the roots of sensitive tropical species.",
  "Group humidity-loving plants together to create a micro-climate with naturally higher moisture.",
  "Add eggshells to your soil for a natural calcium boost that helps build stronger cell walls.",
  "Yellow leaves often mean overwatering, while brown crispy edges usually mean the air is too dry.",
  "Use cinnamon as a natural, mild anti-fungal treatment for seedlings or fresh cuttings.",
  "If you see gnats, let the top inch of soil dry out completely between waterings to break their cycle."
];

const TASK_ICONS: Record<string, string> = {
  'Watering': 'fa-droplet',
  'Pruning': 'fa-scissors',
  'Rotating': 'fa-arrows-rotate',
  'Fertilizing': 'fa-flask',
  'Mist/Clean': 'fa-sparkles',
  'Repotting': 'fa-vial-circle-check',
  'Other': 'fa-bell'
};

// --- Custom Loading Component ---

const BotanicalLoader = ({ type = 'identification' }: { type?: 'identification' | 'diagnosis' }) => {
  const [stage, setStage] = useState(0);
  const messages = type === 'identification' 
    ? ["Scanning cellular structures...", "Cross-referencing regional flora...", "Analyzing local ecosystem data...", "Verified identity found!"]
    : ["Analyzing visual pathology...", "Evaluating nutrient markers...", "Consulting botanical databases...", "Diagnostic complete!"];

  useEffect(() => {
    const interval = setInterval(() => {
      setStage(s => (s < messages.length - 1 ? s + 1 : s));
    }, 2500);
    return () => clearInterval(interval);
  }, [messages.length]);

  return (
    <div className="flex flex-col items-center justify-center py-32 text-plantin-deep gap-10 animate-in fade-in duration-500">
      <div className="relative">
        <div className={`w-28 h-28 border-[4px] border-plantin-sage rounded-full animate-spin ${type === 'diagnosis' ? 'border-t-amber-500' : 'border-t-plantin-leaf'}`}></div>
        <div className="absolute inset-0 flex items-center justify-center">
          <i className={`fas ${type === 'diagnosis' ? 'fa-stethoscope text-amber-500' : 'fa-leaf text-plantin-leaf'} text-3xl animate-pulse`}></i>
        </div>
      </div>
      <div className="text-center px-10 space-y-3">
        <p className="font-serif font-bold text-3xl text-plantin-deep tracking-tight">{messages[stage]}</p>
        <div className="flex justify-center gap-1.5">
          {messages.map((_, i) => (
            <div key={i} className={`w-2 h-2 rounded-full transition-all duration-500 ${i <= stage ? (type === 'diagnosis' ? 'bg-amber-500' : 'bg-plantin-leaf') : 'bg-stone-200'}`}></div>
          ))}
        </div>
        <p className="text-[10px] text-stone-400 font-black uppercase tracking-[0.2em]">Leveraging Multi-Grounding AI</p>
      </div>
    </div>
  );
};

// --- Reusable Botanical View Component ---

const BotanicalResultView = ({ 
  data, 
  imageUrl, 
  sources, 
  user,
  onReset,
  isJournal = false
}: { 
  data: PlantIdentification, 
  imageUrl: string | null, 
  sources: GroundingSource[], 
  user: User,
  onReset?: () => void,
  isJournal?: boolean
}) => {
  return (
    <div className="space-y-6 animate-in slide-in-from-bottom duration-700 pb-16">
      <div className="bg-white rounded-[3rem] overflow-hidden shadow-xl border border-stone-100">
        {imageUrl && (
          <div className="relative h-[24rem] overflow-hidden group">
            <img src={imageUrl} alt={data.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-[5s] ease-in-out" />
            <div className="absolute inset-0 bg-gradient-to-t from-plantin-deep via-plantin-deep/20 to-transparent"></div>
            <div className="absolute bottom-8 left-8 right-8 text-white">
              <div className="flex items-center gap-3 mb-4">
                <span className="px-4 py-1.5 bg-plantin-leaf/40 backdrop-blur-2xl rounded-full text-[9px] font-black uppercase tracking-[0.2em] border border-white/20 shadow-2xl">
                  {isJournal ? 'Saved Entry' : 'Verified Identity'}
                </span>
              </div>
              <h2 className="text-4xl font-serif font-bold tracking-tight mb-2 leading-none">{data.name}</h2>
              <p className="text-plantin-sage font-serif italic text-xl opacity-90">{data.scientificName}</p>
            </div>
          </div>
        )}
        <div className="p-8">
          {data.isToxic && (
            <div className="bg-red-50 text-red-700 p-6 rounded-[2rem] flex items-start gap-4 mb-8 border border-red-100 shadow-sm relative overflow-hidden group">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center text-red-600 shrink-0 relative z-10">
                <i className="fas fa-biohazard text-xl"></i>
              </div>
              <div className="relative z-10">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] mb-1">Botanical Hazard</p>
                <p className="text-sm font-medium leading-relaxed">{data.toxicityDetails || "Caution: This species contains specialized toxins. Keep away from pets and children."}</p>
              </div>
            </div>
          )}
          
          <div className="space-y-3 mb-8 border-l-4 border-plantin-leaf pl-6">
            <h3 className="text-[9px] font-black text-plantin-leaf/40 uppercase tracking-[0.3em]">Botanical Journal</h3>
            <p className="text-plantin-deep font-medium leading-[1.6] text-xl italic font-serif">"{data.description}"</p>
          </div>
          
          <div className="space-y-6 mb-12">
            <h3 className="font-serif font-bold text-2xl text-plantin-deep flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-plantin-soft flex items-center justify-center">
                <i className="fas fa-scroll text-xs opacity-40"></i>
              </div>
              Species Chronicle
            </h3>
            <div className="grid gap-4">
              {data.facts.map((fact, i) => (
                <div key={i} className="flex gap-4 p-5 bg-plantin-soft/50 rounded-[1.5rem] text-plantin-deep text-sm font-medium leading-relaxed hover:bg-white hover:shadow-md transition-all border border-transparent">
                  <span className="w-8 h-8 rounded-xl bg-plantin-leaf flex items-center justify-center shrink-0 text-[10px] font-black text-white shadow-lg">{i+1}</span>
                  <p className="pt-1 italic leading-relaxed">{fact}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-8 mb-8 pt-8 border-t border-stone-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-serif font-bold text-2xl text-plantin-deep">Garden Protocol</h3>
              {!user.isPro && <span className="text-[8px] bg-plantin-gold text-white px-3 py-1.5 rounded-full font-black uppercase tracking-[0.2em] shadow-lg">Upgrade</span>}
            </div>

            {user.isPro ? (
              <div className="grid grid-cols-1 gap-3 animate-in fade-in duration-1000">
                {[
                  { icon: 'fa-droplet', label: 'Hydration', value: data.careGuide.watering, color: 'text-blue-500 bg-blue-50' },
                  { icon: 'fa-sun', label: 'Luminosity', value: data.careGuide.sunlight, color: 'text-amber-500 bg-amber-50' },
                  { icon: 'fa-flask-vial', label: 'Substrate', value: data.careGuide.soil, color: 'text-plantin-leaf bg-plantin-soft' },
                  { icon: 'fa-temperature-arrow-up', label: 'Thermal', value: data.careGuide.temperature, color: 'text-red-400 bg-red-50' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-5 p-4 rounded-[2.2rem] border border-stone-50 bg-white shadow-sm hover:shadow-md transition-all">
                    <div className={`w-14 h-14 shrink-0 rounded-2xl ${item.color} flex items-center justify-center text-xl shadow-inner`}>
                      <i className={`fas ${item.icon}`}></i>
                    </div>
                    <div className="flex-1">
                      <p className="text-[9px] font-black uppercase text-stone-300 mb-0.5 tracking-[0.1em]">{item.label}</p>
                      <p className="text-[13px] font-bold text-plantin-deep leading-snug">{item.value}</p>
                    </div>
                  </div>
                ))}
                <div className="col-span-1 mt-4 p-8 bg-plantin-deep rounded-[2.5rem] border border-white/5 shadow-xl relative overflow-hidden group">
                  <div className="flex flex-col items-center gap-4 relative z-10">
                    <div className="w-12 h-12 bg-white/10 backdrop-blur-xl border border-white/20 rounded-full flex items-center justify-center text-plantin-sage shadow-xl">
                      <i className="fas fa-wand-magic-sparkles text-xl"></i>
                    </div>
                    <h4 className="text-[9px] font-black uppercase text-plantin-sage/60 tracking-[0.3em]">Home Remedies</h4>
                    <div className="grid gap-4 w-full">
                      {data.careGuide.homeRemedies.map((tip, i) => (
                        <div key={i} className="text-xs text-white/80 font-medium flex gap-4 bg-white/5 p-4 rounded-[1.5rem] border border-white/10">
                          <i className="fas fa-sparkles text-plantin-gold mt-0.5 text-[10px]"></i>
                          <p className="italic">{tip}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative overflow-hidden rounded-[2.5rem] bg-plantin-bone p-10 border-2 border-dashed border-plantin-sage text-center">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-plantin-gold mb-6 mx-auto shadow-lg">
                  <i className="fas fa-crown text-2xl"></i>
                </div>
                <p className="text-xl font-serif font-bold text-plantin-deep mb-3">Elite Care Database</p>
                <p className="text-xs text-stone-400 mb-8 font-medium italic">Elevate your gardening mastery with professional-grade schedules.</p>
                <Link to="/profile" className="bg-plantin-deep text-white px-8 py-4 rounded-[1.5rem] text-[9px] font-black uppercase tracking-[0.2em] shadow-xl hover:bg-plantin-leaf transition-all">Unlock Pro</Link>
              </div>
            )}
          </div>

          {!isJournal && sources.length > 0 && (
            <div className="space-y-4 pt-8 border-t border-stone-100">
              <h3 className="text-[9px] font-black text-stone-300 uppercase tracking-[0.3em] text-center">Verified Botanical Sources</h3>
              <div className="flex flex-wrap justify-center gap-2">
                {sources.map((source, i) => (
                  <a 
                    key={i} 
                    href={source.uri} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-[9px] bg-plantin-soft text-plantin-leaf px-4 py-2 rounded-full border border-plantin-sage/20 hover:bg-white transition-all flex items-center gap-2 font-black uppercase tracking-widest shadow-sm"
                  >
                    <i className="fas fa-link text-[7px] opacity-40"></i> {source.title}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {onReset && (
        <button onClick={onReset} className="w-full bg-plantin-deep text-white py-6 rounded-[2rem] font-black shadow-xl hover:bg-plantin-leaf transition-all uppercase tracking-[0.2em] text-[10px] active:scale-95 flex items-center justify-center gap-3">
           <i className="fas fa-camera"></i> {isJournal ? 'Back to Collection' : 'Scan Another Specimen'}
        </button>
      )}
    </div>
  );
};

// --- Reminders Feature Component ---

const RemindersScreen = ({ user }: { user: User }) => {
  const [reminders, setReminders] = useState<PlantReminder[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [plants, setPlants] = useState<JournalEntry[]>([]);

  // Form State
  const [selectedPlantId, setSelectedPlantId] = useState('');
  const [task, setTask] = useState('Watering');
  const [customTask, setCustomTask] = useState('');
  const [frequency, setFrequency] = useState(7);

  useEffect(() => {
    const savedReminders = JSON.parse(localStorage.getItem('plant_reminders') || '[]');
    setReminders(savedReminders);
    const savedJournal = JSON.parse(localStorage.getItem('plant_journal') || '[]');
    setPlants(savedJournal);
  }, []);

  const saveReminders = (updated: PlantReminder[]) => {
    localStorage.setItem('plant_reminders', JSON.stringify(updated));
    setReminders(updated);
  };

  const handleAddReminder = () => {
    const plant = plants.find(p => p.id === selectedPlantId);
    if (!plant && !customTask) return;

    const finalTask = task === 'Other' ? customTask : task;
    const nextDue = new Date();
    nextDue.setDate(nextDue.getDate() + Number(frequency));

    const newReminder: PlantReminder = {
      id: crypto.randomUUID(),
      plantId: selectedPlantId || 'custom',
      plantName: plant ? plant.plant.name : 'Unknown Plant',
      task: finalTask,
      frequencyDays: Number(frequency),
      lastCompleted: new Date().toISOString(),
      nextDue: nextDue.toISOString()
    };

    saveReminders([newReminder, ...reminders]);
    setIsAdding(false);
    setSelectedPlantId('');
    setCustomTask('');
  };

  const handleComplete = (id: string) => {
    const updated = reminders.map(r => {
      if (r.id === id) {
        const nextDue = new Date();
        nextDue.setDate(nextDue.getDate() + r.frequencyDays);
        return {
          ...r,
          lastCompleted: new Date().toISOString(),
          nextDue: nextDue.toISOString()
        };
      }
      return r;
    });
    saveReminders(updated);
  };

  const handleDelete = (id: string) => {
    const updated = reminders.filter(r => r.id !== id);
    saveReminders(updated);
  };

  const getDayStatus = (dateStr: string) => {
    const diff = new Date(dateStr).getTime() - new Date().getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days < 0) return { label: 'Overdue', color: 'text-red-500' };
    if (days === 0) return { label: 'Due Today', color: 'text-amber-500' };
    return { label: `In ${days} day${days > 1 ? 's' : ''}`, color: 'text-plantin-leaf' };
  };

  if (!user.isPro) {
    return <ProRequiredOverlay title="Care Schedule" description="Unlock customizable reminders for watering, pruning, and professional botanical care protocols." />;
  }

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom duration-700 pb-12">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-serif font-bold text-plantin-deep">Care Plans</h2>
          <p className="text-plantin-leaf font-medium text-xs italic">Keep your garden thriving</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="w-12 h-12 rounded-xl bg-plantin-leaf text-white flex items-center justify-center shadow-lg shadow-plantin-leaf/20 hover:scale-105 active:scale-95 transition-all"
        >
          <i className="fas fa-plus text-lg"></i>
        </button>
      </div>

      {isAdding && (
        <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-plantin-sage/20 animate-in zoom-in duration-300">
          <h3 className="text-xl font-serif font-bold text-plantin-deep mb-5">New Reminder</h3>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-plantin-leaf/50 tracking-widest ml-1">Which Plant?</label>
              <select 
                value={selectedPlantId}
                onChange={(e) => setSelectedPlantId(e.target.value)}
                className="w-full bg-plantin-soft border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-plantin-leaf outline-none font-medium text-sm"
              >
                <option value="">Select from your garden</option>
                {plants.map(p => (
                  <option key={p.id} value={p.id}>{p.plant.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-plantin-leaf/50 tracking-widest ml-1">Task Type</label>
              <div className="grid grid-cols-2 gap-2">
                {['Watering', 'Pruning', 'Rotating', 'Fertilizing', 'Mist/Clean', 'Other'].map(t => (
                  <button 
                    key={t}
                    onClick={() => setTask(t)}
                    className={`py-2 px-3 rounded-xl border text-[10px] font-bold transition-all ${task === t ? 'bg-plantin-leaf text-white border-plantin-leaf' : 'bg-white text-stone-400 border-stone-100'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {task === 'Other' && (
              <input 
                type="text"
                placeholder="Custom Task (e.g. Wipe leaves)"
                value={customTask}
                onChange={(e) => setCustomTask(e.target.value)}
                className="w-full bg-plantin-soft border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-plantin-leaf outline-none text-sm"
              />
            )}

            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-plantin-leaf/50 tracking-widest ml-1">Frequency (Days)</label>
              <input 
                type="number"
                min="1"
                value={frequency}
                onChange={(e) => setFrequency(Number(e.target.value))}
                className="w-full bg-plantin-soft border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-plantin-leaf outline-none text-sm"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button 
                onClick={() => setIsAdding(false)}
                className="flex-1 bg-stone-100 text-stone-400 py-3 rounded-xl font-black text-[9px] uppercase tracking-widest"
              >
                Cancel
              </button>
              <button 
                onClick={handleAddReminder}
                className="flex-1 bg-plantin-leaf text-white py-3 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-lg shadow-plantin-leaf/20"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {reminders.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-[2.5rem] border border-dashed border-plantin-sage/30">
          <i className="fas fa-calendar-check text-4xl text-stone-100 mb-4 block"></i>
          <p className="text-stone-400 font-medium font-serif italic text-sm">Your care schedule is clear.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {reminders.map((r) => {
            const status = getDayStatus(r.nextDue);
            const icon = TASK_ICONS[r.task] || 'fa-bell';
            return (
              <div key={r.id} className="bg-white p-5 rounded-[2rem] shadow-sm border border-stone-100 flex items-center justify-between group hover:shadow-lg transition-all relative overflow-hidden">
                <div className="flex gap-4 items-center">
                  <div className={`w-12 h-12 rounded-xl ${status.label === 'Overdue' ? 'bg-red-50 text-red-500' : 'bg-plantin-soft text-plantin-leaf'} flex items-center justify-center shadow-inner`}>
                    <i className={`fas ${icon} text-lg`}></i>
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-plantin-deep leading-tight">{r.task}</h3>
                    <p className="text-[10px] text-stone-400 font-medium mb-1">{r.plantName}</p>
                    <p className={`text-[8px] font-black uppercase tracking-widest ${status.color}`}>{status.label}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                   <button 
                    onClick={() => handleComplete(r.id)}
                    className="w-10 h-10 rounded-full bg-plantin-soft text-plantin-leaf hover:bg-plantin-leaf hover:text-white transition-all flex items-center justify-center shadow-sm"
                    title="Mark as done"
                  >
                    <i className="fas fa-check text-xs"></i>
                  </button>
                  <button 
                    onClick={() => handleDelete(r.id)}
                    className="w-10 h-10 rounded-full bg-red-50 text-red-300 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center shadow-sm"
                    title="Delete"
                  >
                    <i className="fas fa-trash-can text-xs"></i>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// --- Auth Components ---

const AuthScreen = ({ onLogin }: { onLogin: (u: User) => void }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (isLogin) {
        const user = authService.login(email, password);
        onLogin(user);
      } else {
        const user = authService.signup(email, name, password);
        onLogin(user);
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    }
  };

  return (
    <div className="min-h-screen bg-plantin-bone flex flex-col justify-center px-8 py-10 animate-in fade-in duration-700 relative overflow-hidden">
      <div className="text-center mb-10 relative z-10">
        <div className="w-20 h-20 bg-plantin-leaf rounded-[2rem] flex items-center justify-center text-white shadow-2xl mx-auto mb-4 border-4 border-white">
          <i className="fas fa-leaf text-3xl"></i>
        </div>
        <h1 className="text-4xl font-serif font-bold text-plantin-deep tracking-tight mb-1">FloraGenius</h1>
        <p className="text-plantin-leaf/60 font-medium tracking-wide italic text-sm">"Nurture your curiosity."</p>
      </div>

      <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-plantin-sage/20 relative z-10">
        <h2 className="text-xl font-serif font-semibold text-plantin-deep mb-6 text-center">
          {isLogin ? "Welcome back" : "Start your digital garden"}
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div className="space-y-1">
              <label className="text-[9px] font-black text-plantin-leaf/50 uppercase ml-4 tracking-[0.2em]">Name</label>
              <input 
                type="text" 
                required 
                placeholder="Botanist Name"
                className="w-full bg-plantin-soft border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-plantin-leaf transition-all outline-none text-plantin-deep placeholder:text-stone-300 text-sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-1">
            <label className="text-[9px] font-black text-plantin-leaf/50 uppercase ml-4 tracking-[0.2em]">Email</label>
            <input 
              type="email" 
              required 
              placeholder="seedling@nature.com"
              className="w-full bg-plantin-soft border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-plantin-leaf transition-all outline-none text-plantin-deep placeholder:text-stone-300 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-plantin-leaf/50 uppercase ml-4 tracking-[0.2em]">Password</label>
            <input 
              type="password" 
              required 
              placeholder="••••••••"
              className="w-full bg-plantin-soft border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-plantin-leaf transition-all outline-none text-plantin-deep placeholder:text-stone-300 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <p className="text-red-500 text-[10px] font-bold text-center mt-2">{error}</p>}

          <button 
            type="submit"
            className="w-full bg-plantin-leaf text-white py-4 rounded-[1.5rem] font-black shadow-lg shadow-plantin-leaf/20 hover:brightness-110 active:scale-[0.98] transition-all mt-4 text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-2"
          >
            {isLogin ? <><i className="fas fa-sign-in-alt"></i> Enter Garden</> : <><i className="fas fa-seedling"></i> Plant Seed</>}
          </button>
        </form>

        <button 
          onClick={() => setIsLogin(!isLogin)}
          className="w-full text-[10px] text-plantin-leaf font-black mt-6 text-center hover:opacity-70 transition-opacity uppercase tracking-widest"
        >
          {isLogin ? "Join the community →" : "Back to sign in"}
        </button>
      </div>
    </div>
  );
};

// --- Feature Components ---

const ProRequiredOverlay = ({ title, description }: { title?: string, description?: string }) => (
  <div className="bg-white rounded-[2.5rem] p-8 text-center space-y-4 shadow-xl border border-plantin-sage/20 relative overflow-hidden">
    <div className="w-20 h-20 bg-plantin-soft rounded-full flex items-center justify-center text-plantin-gold mx-auto shadow-inner relative z-10">
      <i className="fas fa-crown text-3xl"></i>
    </div>
    <div className="space-y-1 relative z-10">
      <h3 className="text-2xl font-serif font-bold text-plantin-deep">{title || "Premium Feature"}</h3>
      <p className="text-stone-500 font-medium leading-relaxed italic text-sm">"{description || "This feature is reserved for our Pro members."}"</p>
    </div>
    <Link to="/profile" className="inline-block bg-plantin-leaf text-white px-10 py-4 rounded-[1.5rem] font-black shadow-xl shadow-plantin-leaf/20 hover:brightness-110 transition-all text-[9px] uppercase tracking-[0.2em] relative z-10">
      Upgrade to Pro
    </Link>
  </div>
);

const JournalScreen = ({ user }: { user: User }) => {
  const [journal, setJournal] = useState<JournalEntry[]>([]);

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('plant_journal') || '[]');
    setJournal(saved);
  }, []);

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom duration-700">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-serif font-bold text-plantin-deep">My Garden</h2>
          <p className="text-plantin-leaf font-medium text-xs italic">Your digital herbarium</p>
        </div>
        <div className="w-12 h-12 rounded-xl bg-plantin-soft flex items-center justify-center text-plantin-leaf border border-plantin-sage/20">
          <i className="fas fa-book-open text-lg"></i>
        </div>
      </div>
      
      {journal.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-[2.5rem] border border-dashed border-plantin-sage/30 relative overflow-hidden group">
          <div className="w-20 h-20 bg-plantin-bone rounded-full flex items-center justify-center text-stone-200 mx-auto mb-4">
            <i className="fas fa-seedling text-3xl"></i>
          </div>
          <p className="text-stone-400 font-medium font-serif italic text-base px-6">Your sanctuary is quiet.</p>
          <Link to="/identify" className="inline-block mt-6 bg-plantin-leaf text-white px-6 py-3 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-lg">
            Identify First Plant
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {journal.map((item) => (
            <Link key={item.id} to={`/history/${item.id}`} className="bg-white p-4 rounded-[2rem] shadow-sm border border-stone-100 flex items-center gap-4 group hover:shadow-lg transition-all active:scale-[0.98]">
              <div className="w-20 h-20 rounded-[1.5rem] overflow-hidden bg-plantin-soft shrink-0 border-2 border-white shadow-md relative z-10">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.plant.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-[2s]" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-plantin-leaf/30">
                    <i className="fas fa-image text-xl"></i>
                  </div>
                )}
              </div>
              <div className="flex-1 pr-2 relative z-10">
                <div className="flex justify-between items-start mb-0.5">
                  <h3 className="font-bold text-base text-plantin-deep leading-tight truncate max-w-[120px]">{item.plant.name}</h3>
                  <span className="text-[7px] font-black text-stone-300 uppercase tracking-widest bg-stone-50 px-2 py-0.5 rounded-full">{new Date(item.timestamp).toLocaleDateString()}</span>
                </div>
                <p className="text-[10px] text-plantin-leaf font-serif italic mb-2 opacity-70 truncate">{item.plant.scientificName}</p>
                <div className="flex flex-wrap gap-1.5">
                   {item.plant.isToxic && <span className="px-1.5 py-0.5 bg-red-50 text-red-500 rounded-full text-[7px] font-black uppercase tracking-tighter border border-red-100">Toxic</span>}
                   <span className="px-1.5 py-0.5 bg-plantin-soft text-plantin-leaf rounded-full text-[7px] font-black uppercase tracking-tighter border border-plantin-sage/20">{item.plant.family}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

const JournalEntryDetailScreen = ({ user }: { user: User }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [entry, setEntry] = useState<JournalEntry | null>(null);

  useEffect(() => {
    const journal = JSON.parse(localStorage.getItem('plant_journal') || '[]');
    const found = journal.find((j: JournalEntry) => j.id === id);
    if (found) {
      setEntry(found);
    } else {
      navigate('/history');
    }
  }, [id, navigate]);

  if (!entry) return null;

  return (
    <div className="animate-in fade-in duration-700">
      <BotanicalResultView 
        data={entry.plant} 
        imageUrl={entry.imageUrl} 
        sources={[]} 
        user={user} 
        isJournal={true}
        onReset={() => navigate('/history')}
      />
    </div>
  );
};

const ShopsScreen = ({ user, coords }: { user: User, coords: GeolocationCoordinates | null }) => {
  const [loading, setLoading] = useState(false);
  const [centers, setCenters] = useState<GroundingSource[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user.isPro) {
      if (coords) {
        fetchShops(coords.latitude, coords.longitude);
      } else {
        setLoading(true);
        navigator.geolocation.getCurrentPosition(
          (pos) => fetchShops(pos.coords.latitude, pos.coords.longitude),
          () => {
            setError("Location permission denied.");
            setLoading(false);
          }
        );
      }
    }
  }, [user.isPro, coords]);

  const fetchShops = async (lat: number, lng: number) => {
    setLoading(true);
    try {
      const { centers } = await getNearbyGardenCenters(lat, lng);
      setCenters(centers);
    } catch (e) {
      setError("Failed to locate centers.");
    } finally {
      setLoading(false);
    }
  };

  if (!user.isPro) return <ProRequiredOverlay title="Garden Shops" description="Discover elite nurseries and supplies in your area." />;

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom duration-700">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-serif font-bold text-plantin-deep">Nurseries</h2>
          <p className="text-plantin-leaf font-medium text-xs italic">Locate botanical supplies</p>
        </div>
        <div className="w-12 h-12 rounded-xl bg-plantin-leaf text-white flex items-center justify-center shadow-lg shadow-plantin-leaf/20">
          <i className="fas fa-map-pin text-lg"></i>
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-6">
          <div className="w-16 h-16 border-4 border-plantin-sage border-t-plantin-leaf rounded-full animate-spin"></div>
          <p className="font-serif font-bold text-lg text-plantin-deep italic opacity-60">Scanning landscape...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 p-6 rounded-[2rem] text-red-600 text-[10px] font-medium border border-red-100 flex items-start gap-3">
          <i className="fas fa-circle-exclamation mt-0.5 text-sm"></i>
          <p>{error}</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {centers.map((center, i) => (
            <a 
              key={i} 
              href={center.uri} 
              target="_blank" 
              rel="noopener noreferrer"
              className="bg-white p-5 rounded-[2rem] shadow-sm border border-stone-100 flex items-center justify-between hover:border-plantin-leaf transition-all active:scale-[0.98]"
            >
              <div className="flex gap-4 items-center">
                <div className="w-12 h-12 bg-plantin-soft rounded-xl flex items-center justify-center text-plantin-leaf">
                  <i className="fas fa-tree text-xl"></i>
                </div>
                <div>
                  <h3 className="font-bold text-base text-plantin-deep leading-tight truncate max-w-[180px]">{center.title}</h3>
                  <span className="text-[8px] text-plantin-leaf font-black uppercase tracking-[0.2em] opacity-60">Garden Center</span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-full bg-plantin-soft text-plantin-leaf flex items-center justify-center">
                <i className="fas fa-directions text-xs"></i>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

const HomeScreen = ({ user, coords }: { user: User, coords: GeolocationCoordinates | null }) => {
  const [localFlora, setLocalFlora] = useState<{ text: string, sources: GroundingSource[] } | null>(null);
  const [loadingFlora, setLoadingFlora] = useState(false);

  const botanicalTip = useMemo(() => PLANT_TIPS[Math.floor(Math.random() * PLANT_TIPS.length)], []);

  const discoverFlora = async () => {
    if (!coords) return;
    setLoadingFlora(true);
    try {
      const flora = await getLocalFlora(coords.latitude, coords.longitude);
      setLocalFlora(flora);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingFlora(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="relative overflow-hidden rounded-[3rem] bg-plantin-deep text-white shadow-2xl group">
        <div className="relative h-64 w-full overflow-hidden">
          <img 
            src="https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&q=80&w=1200" 
            alt="Nature backdrop" 
            className="w-full h-full object-cover opacity-60 transition-transform duration-[20s] ease-out"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-plantin-deep via-plantin-deep/20 to-transparent"></div>
          <div className="absolute top-6 right-6 bg-plantin-leaf/30 backdrop-blur-2xl px-4 py-2 rounded-full text-[8px] font-black uppercase tracking-[0.2em] border border-white/10 flex items-center gap-2">
            <i className={`fas fa-leaf ${coords ? 'text-emerald-400' : 'text-white'} animate-pulse`}></i>
            {coords ? 'Local Habitat Active' : 'Botanical AI'}
          </div>
        </div>

        <div className="p-8 pt-0 relative z-10 -mt-16">
          <h1 className="text-4xl font-serif font-bold mb-2 tracking-tighter leading-[1]">{user.name.split(' ')[0]}<span className="text-plantin-sage">.</span></h1>
          <p className="text-plantin-sage font-medium text-base italic opacity-90 leading-relaxed max-w-[90%]">Explore botanical secrets.</p>
          
          <div className="mt-8 flex gap-3">
            <Link to="/identify" className="flex-1 bg-white text-plantin-deep px-4 py-4 rounded-[1.5rem] font-black text-center shadow-xl hover:bg-plantin-soft transition-all text-[10px] uppercase tracking-widest flex items-center justify-center gap-2">
              <i className="fas fa-camera text-sm"></i> Identify
            </Link>
            <Link to="/diagnose" className="flex-1 bg-plantin-leaf text-white px-4 py-4 rounded-[1.5rem] font-black text-center shadow-xl hover:brightness-110 transition-all text-[10px] uppercase tracking-widest flex items-center justify-center gap-2">
              <i className="fas fa-stethoscope text-sm"></i> Diagnose
            </Link>
          </div>
        </div>
      </div>

      {user.isPro && coords && (
        <section className="bg-white p-8 rounded-[2.5rem] border border-plantin-sage/20 shadow-sm relative overflow-hidden group">
          <div className="flex justify-between items-center mb-6 relative z-10">
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-plantin-soft rounded-xl flex items-center justify-center text-plantin-leaf">
                  <i className="fas fa-mountain-sun text-lg"></i>
               </div>
               <h3 className="font-serif font-bold text-xl text-plantin-deep">Eco-Scan</h3>
            </div>
            <button 
              onClick={discoverFlora}
              disabled={loadingFlora}
              className="w-8 h-8 bg-plantin-soft rounded-full flex items-center justify-center text-plantin-leaf hover:bg-plantin-leaf hover:text-white transition-all disabled:opacity-50"
            >
              <i className={`fas fa-arrows-rotate text-xs ${loadingFlora ? 'animate-spin' : ''}`}></i>
            </button>
          </div>
          
          {localFlora ? (
            <div className="animate-in fade-in slide-in-from-top-4 duration-700 relative z-10">
              <p className="text-xs text-plantin-deep font-medium leading-[1.7] italic mb-6 border-l-4 border-plantin-sage pl-4">"{localFlora.text}"</p>
              <div className="flex flex-wrap gap-2">
                {localFlora.sources.map((s, i) => (
                  <a key={i} href={s.uri} target="_blank" className="text-[8px] bg-plantin-soft text-plantin-leaf px-4 py-1.5 rounded-full font-black uppercase tracking-widest border border-plantin-sage/20">
                    <i className="fas fa-location-arrow text-[7px]"></i> {s.title}
                  </a>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-6 relative z-10 bg-plantin-bone/50 rounded-[1.5rem] border border-stone-50">
              <p className="text-xs mb-6 font-serif italic text-stone-400 max-w-[80%] mx-auto">Discover which plant species are thriving in your current climate.</p>
              <button onClick={discoverFlora} className="bg-plantin-deep text-white px-8 py-3 rounded-[1.2rem] text-[9px] font-black uppercase tracking-[0.2em] shadow-lg">Start Ecology Scan</button>
            </div>
          )}
        </section>
      )}

      <section>
        <div className="flex justify-between items-end mb-6">
          <h2 className="text-xl font-serif font-bold text-plantin-deep">Botanist Tools</h2>
          <Link to="/profile" className="text-[9px] font-black text-plantin-leaf uppercase tracking-widest hover:opacity-70">
            Pro Features
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[
            { icon: 'fa-user-md', label: 'Doctor', path: '/diagnose', pro: true, desc: 'Heal infections' },
            { icon: 'fa-seedling', label: 'My Garden', path: '/history', desc: 'Collection' },
            { icon: 'fa-calendar-check', label: 'Care Schedule', path: '/reminders', pro: true, desc: 'Water & prune' },
            { icon: 'fa-store-alt', label: 'Nurseries', path: '/shops', pro: true, desc: 'Local supplies' },
          ].map((feat, i) => (
            <Link 
              key={i} 
              to={feat.path}
              className={`p-6 rounded-[2rem] border border-stone-50 bg-white flex flex-col items-center text-center gap-3 shadow-sm hover:shadow-lg transition-all active:scale-[0.96]`}
            >
              <div className="w-12 h-12 rounded-xl bg-plantin-soft flex items-center justify-center text-xl shadow-inner relative">
                <i className={`fas ${feat.icon}`}></i>
                {feat.pro && !user.isPro && (
                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-plantin-gold rounded-full flex items-center justify-center text-[7px] text-white border-2 border-white shadow-lg">
                    <i className="fas fa-crown"></i>
                  </div>
                )}
              </div>
              <div>
                <span className="text-sm font-bold text-plantin-deep block leading-tight">{feat.label}</span>
                <span className="text-[9px] font-medium text-stone-300 block mt-0.5 tracking-tight">{feat.desc}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="bg-plantin-deep rounded-[3rem] p-10 flex flex-col items-center text-center gap-6 border border-white/5 relative overflow-hidden shadow-xl">
        <div className="w-16 h-16 rounded-[1.5rem] bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center text-white shadow-xl relative z-10">
          <i className="fas fa-spa text-2xl"></i>
        </div>
        <div className="relative z-10">
          <p className="text-[9px] font-black text-plantin-sage/40 uppercase tracking-[0.3em] mb-3">Strategy</p>
          <p className="text-xl font-serif font-medium text-white leading-relaxed italic">"{botanicalTip}"</p>
        </div>
      </div>
    </div>
  );
};

const IdentifyScreen = ({ user, coords }: { user: User, coords: GeolocationCoordinates | null }) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{data: PlantIdentification, sources: GroundingSource[], referenceImage?: string | null} | null>(null);
  const [observations, setObservations] = useState('');

  const handleIdentify = async (base64: string) => {
    setLoading(true);
    try {
      const res = await identifyPlant(base64, coords?.latitude, coords?.longitude, observations);
      const referenceImage = await generatePlantImage(res.data.name);
      
      const finalImage = referenceImage ? await compressBase64(referenceImage) : null;
      
      const newEntry: JournalEntry = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        plant: res.data,
        imageUrl: finalImage
      };
      
      const journal = JSON.parse(localStorage.getItem('plant_journal') || '[]');
      const updatedJournal = [newEntry, ...journal].slice(0, 20);
      try {
        localStorage.setItem('plant_journal', JSON.stringify(updatedJournal));
      } catch (e) {
        localStorage.setItem('plant_journal', JSON.stringify(updatedJournal.slice(0, 10)));
      }
      
      setResult({ ...res, referenceImage });
    } catch (error) {
      console.error(error);
      alert("Botanical scan failed. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <BotanicalLoader type="identification" />;

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {!result ? (
        <div className="space-y-8">
          <div className="flex justify-between items-center">
             <h2 className="text-4xl font-serif font-bold text-plantin-deep">Identify</h2>
             <div className="w-10 h-10 rounded-xl bg-plantin-soft flex items-center justify-center text-plantin-leaf">
                <i className="fas fa-magnifying-glass-leaf text-lg"></i>
             </div>
          </div>
          
          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase text-plantin-leaf/50 tracking-widest ml-1">Additional Observations (Optional)</label>
            <textarea 
              placeholder="e.g. Jagged leaf edges, purple flowers, found in partial shade..."
              className="w-full bg-white border border-stone-100 rounded-[1.5rem] px-5 py-4 focus:ring-2 focus:ring-plantin-leaf outline-none text-sm min-h-[100px] shadow-sm"
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
            />
          </div>

          <CameraCapture label="Snap Botanical Photo" onCapture={handleIdentify} />
          
          <div className="bg-plantin-soft/50 p-6 rounded-[2rem] border border-plantin-sage/20">
             <p className="text-center text-xs font-serif italic text-plantin-deep/60 leading-relaxed">Capture any leaf, flower, or bark to unveil its species instantly. AI will cross-reference your location for higher accuracy.</p>
          </div>
        </div>
      ) : (
        <BotanicalResultView 
          data={result.data} 
          imageUrl={result.referenceImage || null} 
          sources={result.sources} 
          user={user} 
          onReset={() => setResult(null)} 
        />
      )}
    </div>
  );
};

const DiagnoseScreen = ({ user, coords }: { user: User, coords: GeolocationCoordinates | null }) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{data: PlantDiagnosis, sources: GroundingSource[]} | null>(null);

  const handleDiagnose = async (base64: string) => {
    setLoading(true);
    try {
      const res = await diagnosePlant(base64, coords?.latitude, coords?.longitude);
      setResult(res);
      const history = JSON.parse(localStorage.getItem('plant_history') || '[]');
      localStorage.setItem('plant_history', JSON.stringify([res.data, ...history].slice(0, 20)));
    } catch (error) {
      console.error(error);
      alert("Diagnostic failure. Ensure the plant is clearly visible.");
    } finally {
      setLoading(false);
    }
  };

  if (!user.isPro) return <ProRequiredOverlay title="Botanical Physician" description="Access advanced health diagnostics for your plants." />;

  if (loading) return <BotanicalLoader type="diagnosis" />;

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {!result ? (
        <div className="space-y-8">
           <div className="flex justify-between items-center">
             <h2 className="text-4xl font-serif font-bold text-plantin-deep">Diagnose</h2>
             <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500">
                <i className="fas fa-staff-snake text-lg"></i>
             </div>
          </div>
          <CameraCapture label="Scan symptomatic area" onCapture={handleDiagnose} />
          <div className="bg-amber-50/50 p-6 rounded-[2rem] border border-amber-100/50">
             <p className="text-center text-xs font-serif italic text-amber-900/60 leading-relaxed">Instantly identify wilting, spotting, or parasitic infestations using regional ecological grounding.</p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-[2.5rem] p-8 shadow-xl border-l-[12px] border-l-amber-500 animate-in zoom-in duration-700 relative overflow-hidden">
          <div className="mb-10 relative z-10">
            <span className="text-[9px] bg-amber-50 text-amber-700 px-4 py-1.5 rounded-full font-black uppercase tracking-[0.2em] mb-4 inline-block shadow-sm">Diagnosis</span>
            <h2 className="text-4xl font-serif font-bold text-plantin-deep mb-1 leading-tight tracking-tighter">{result.data.plantName}</h2>
            <p className="text-2xl font-serif italic text-amber-600 font-semibold tracking-tight">{result.data.issue}</p>
          </div>
          
          <div className="space-y-8 relative z-10">
            <div className="p-8 bg-plantin-soft/40 rounded-[2rem] shadow-inner border border-plantin-sage/10 relative overflow-hidden group">
              <h4 className="text-[9px] font-black uppercase text-plantin-leaf mb-6 tracking-[0.3em] text-center">Treatment Plan</h4>
              <ul className="grid gap-4">
                {result.data.recommendations.map((r, i) => (
                  <li key={i} className="text-xs font-medium text-plantin-deep flex gap-4 bg-white/95 p-5 rounded-[1.5rem] shadow-sm border border-stone-50 transition-all">
                    <div className="w-6 h-6 rounded-lg bg-plantin-leaf text-white flex items-center justify-center shrink-0 text-[10px] shadow-lg">
                      <i className="fas fa-hand-holding-medical"></i>
                    </div>
                    <p className="flex-1 leading-relaxed italic">"{r}"</p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div className="p-6 bg-plantin-bone rounded-[1.5rem] border border-stone-50 text-center">
                  <p className="text-[9px] font-black text-stone-300 uppercase tracking-[0.1em] mb-2">Confidence</p>
                  <p className="text-2xl font-serif font-bold text-plantin-leaf tracking-tighter">{(result.data.confidence * 100).toFixed(0)}%</p>
               </div>
               <div className="p-6 bg-plantin-bone rounded-[1.5rem] border border-stone-50 text-center">
                  <p className="text-[9px] font-black text-stone-300 uppercase tracking-[0.1em] mb-2">Status</p>
                  <p className="text-xs font-serif font-bold text-plantin-deep italic leading-tight">{result.data.prognosis}</p>
               </div>
            </div>

            {result.sources.length > 0 && (
              <div className="space-y-4 pt-4 text-center">
                <h4 className="text-[8px] font-black text-stone-300 uppercase tracking-[0.3em]">References & Local Data</h4>
                <div className="flex flex-wrap justify-center gap-2">
                  {result.sources.map((source, i) => (
                    <a key={i} href={source.uri} target="_blank" className="text-[8px] bg-amber-50 text-amber-700 px-4 py-2 rounded-full border border-amber-100 font-black uppercase tracking-widest shadow-sm">
                      <i className="fas fa-file-medical text-[8px] opacity-40 mr-1"></i> {source.title}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button onClick={() => setResult(null)} className="w-full bg-plantin-deep text-white py-6 rounded-[2rem] font-black shadow-xl hover:bg-plantin-leaf transition-all uppercase tracking-[0.2em] text-[10px] mt-10 flex items-center justify-center gap-3 active:scale-95">
             <i className="fas fa-rotate"></i> New Scan
          </button>
        </div>
      )}
    </div>
  );
};

// --- Profile Screen Component ---

const ProfileScreen = ({ user, onLogout, onUpgrade }: { user: User, onLogout: () => void, onUpgrade: () => void }) => {
  const [upgrading, setUpgrading] = useState(false);
  const [notifSettings, setNotifSettings] = useState<NotificationSettings>(() => {
    const saved = localStorage.getItem(`flora_genius_settings_${user.id}`);
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  const handleUpgrade = async () => {
    setUpgrading(true);
    try {
      authService.upgradeToPro(user.id);
      onUpgrade();
    } catch (e) {
      console.error(e);
    } finally {
      setUpgrading(false);
    }
  };

  const toggleNotif = (key: keyof NotificationSettings) => {
    const updated = { ...notifSettings, [key]: !notifSettings[key] };
    setNotifSettings(updated);
    localStorage.setItem(`flora_genius_settings_${user.id}`, JSON.stringify(updated));
    window.dispatchEvent(new Event('storage'));
  };

  return (
    <div className="space-y-10 animate-in slide-in-from-bottom duration-700">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-4xl font-serif font-bold text-plantin-deep">Profile</h2>
          <p className="text-plantin-leaf font-medium text-xs italic">Cultivating expertise</p>
        </div>
        <div className="w-12 h-12 rounded-xl bg-plantin-soft flex items-center justify-center text-plantin-leaf border border-plantin-sage/20">
           <i className="fas fa-id-badge text-lg"></i>
        </div>
      </div>

      <div className="bg-white p-10 rounded-[3rem] shadow-xl border border-stone-50 space-y-10 relative overflow-hidden group">
        <div className="flex flex-col items-center gap-6 relative z-10">
          <div className="w-32 h-32 rounded-[3rem] bg-plantin-leaf flex items-center justify-center text-white text-5xl font-serif font-black shadow-2xl border-[8px] border-white">
            {user.name[0]}
          </div>
          <div className="text-center">
            <h3 className="text-3xl font-serif font-bold text-plantin-deep mb-1 tracking-tight">{user.name}</h3>
            <p className="text-stone-400 font-medium tracking-[0.1em] uppercase text-[10px]">{user.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 relative z-10">
          <div className="p-6 rounded-[2rem] bg-plantin-soft/30 border border-plantin-sage/10 text-center">
            <p className="text-[9px] font-black uppercase text-stone-300 mb-2 tracking-[0.2em]">Tier</p>
            <div className="flex items-center justify-center gap-2">
              <span className={`text-base font-black ${user.isPro ? 'text-plantin-leaf' : 'text-stone-400'} uppercase tracking-[0.1em]`}>
                {user.isPro ? 'Pro' : 'Free'}
              </span>
              {user.isPro && <i className="fas fa-gem text-plantin-gold text-xs"></i>}
            </div>
          </div>
          <div className="p-6 rounded-[2rem] bg-plantin-soft/30 border border-plantin-sage/10 text-center">
            <p className="text-[9px] font-black uppercase text-stone-300 mb-2 tracking-[0.2em]">Status</p>
            <div className="flex items-center justify-center gap-2">
               <span className="text-[10px] font-black text-plantin-deep uppercase tracking-widest">Active</span>
            </div>
          </div>
        </div>

        {user.isPro && (
          <div className="space-y-6 pt-6 border-t border-stone-50 relative z-10">
            <h4 className="text-[9px] font-black text-stone-300 uppercase tracking-[0.3em] text-center">Notifications</h4>
            <div className="grid gap-3">
              {(Object.keys(DEFAULT_SETTINGS) as Array<keyof NotificationSettings>).map(key => (
                <button 
                  key={key}
                  onClick={() => toggleNotif(key)}
                  className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${notifSettings[key] ? 'bg-plantin-soft border-plantin-sage text-plantin-deep' : 'bg-white border-stone-100 text-stone-300'}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-inner ${notifSettings[key] ? 'bg-white text-plantin-leaf' : 'bg-stone-50 text-stone-200'}`}>
                      <i className={`fas ${TASK_ICONS[key] || 'fa-bell'} text-xs`}></i>
                    </div>
                    <span className="text-xs font-bold">{key}</span>
                  </div>
                  <div className={`w-10 h-5 rounded-full relative transition-colors ${notifSettings[key] ? 'bg-plantin-leaf' : 'bg-stone-100'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${notifSettings[key] ? 'right-0.5' : 'left-0.5'}`}></div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {!user.isPro && (
          <div className="bg-plantin-deep p-8 rounded-[2rem] text-white shadow-xl relative overflow-hidden group/pro">
            <div className="relative z-10">
              <h4 className="text-2xl font-serif font-bold mb-3 tracking-tight">Elite Suite</h4>
              <p className="text-xs text-plantin-sage font-medium mb-8 opacity-80 leading-relaxed italic">
                Unlock diagnostics, ecology maps, and unlimited herbarium space.
              </p>
              <button 
                onClick={handleUpgrade}
                disabled={upgrading}
                className="w-full bg-white text-plantin-deep py-4 rounded-[1.2rem] font-black text-[9px] uppercase tracking-[0.2em] shadow-xl hover:bg-plantin-soft transition-all"
              >
                {upgrading ? 'Processing...' : 'Get Lifetime - $9.99'}
              </button>
            </div>
          </div>
        )}

        <button 
          onClick={onLogout}
          className="w-full text-stone-300 text-[10px] font-black uppercase tracking-[0.3em] hover:text-red-500 transition-colors pt-8 border-t border-stone-50"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
};

const Nav = ({ user }: { user: User }) => {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path || (path === '/history' && location.pathname.startsWith('/history/'));

  return (
    <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[92%] max-w-sm glass rounded-[2.5rem] px-8 py-5 flex justify-between items-center z-50 shadow-[0_20px_40px_-10px_rgba(30,58,52,0.2)] border border-white/60">
      <Link to="/" className={`flex flex-col items-center transition-all duration-300 ${isActive('/') && !location.pathname.startsWith('/history') && !location.pathname.startsWith('/reminders') ? 'text-plantin-leaf scale-125' : 'text-stone-300'}`}>
        <i className="fas fa-seedling text-xl"></i>
      </Link>
      <Link to="/reminders" className={`relative flex flex-col items-center transition-all duration-300 ${isActive('/reminders') ? 'text-plantin-leaf scale-125' : 'text-stone-300'}`}>
        <i className="fas fa-calendar-check text-xl"></i>
        {!user.isPro && <div className="absolute -top-1 -right-1 w-3 h-3 bg-plantin-gold rounded-full border border-white flex items-center justify-center text-[5px] text-white"><i className="fas fa-crown"></i></div>}
      </Link>
      <div className="relative">
        <Link to="/diagnose" className="w-14 h-14 bg-plantin-leaf rounded-full flex items-center justify-center text-white shadow-xl -mt-16 border-[4px] border-plantin-bone active:scale-90 transition-transform">
          <i className="fas fa-stethoscope text-xl"></i>
        </Link>
      </div>
      <Link to="/history" className={`flex flex-col items-center transition-all duration-300 ${isActive('/history') ? 'text-plantin-leaf scale-125' : 'text-stone-300'}`}>
        <i className="fas fa-book-leaf text-xl"></i>
      </Link>
      <Link to="/profile" className={`flex flex-col items-center transition-all duration-300 ${isActive('/profile') ? 'text-plantin-leaf scale-125' : 'text-stone-300'}`}>
        <i className="fas fa-user-circle text-xl"></i>
      </Link>
    </nav>
  );
};

// --- Push-style Popup Manager ---

const InAppNotification = ({ message, onClose }: { message: string, onClose: () => void }) => (
  <div className="fixed top-6 left-1/2 -translate-x-1/2 w-[88%] max-w-sm bg-plantin-deep text-white p-5 rounded-[1.8rem] shadow-2xl z-[100] animate-in slide-in-from-top duration-500 flex items-center gap-4 border border-white/10">
    <div className="w-10 h-10 rounded-full bg-plantin-leaf flex items-center justify-center shrink-0">
      <i className="fas fa-bell text-sm animate-swing"></i>
    </div>
    <div className="flex-1">
      <p className="text-[8px] font-black uppercase tracking-[0.1em] text-plantin-sage mb-0.5">Care Reminder</p>
      <p className="text-xs font-medium leading-snug">{message}</p>
    </div>
    <button onClick={onClose} className="w-6 h-6 flex items-center justify-center opacity-40">
      <i className="fas fa-xmark text-xs"></i>
    </button>
  </div>
);

const App = () => {
  const [user, setUser] = useState<User | null>(authService.getSession());
  const [coords, setCoords] = useState<GeolocationCoordinates | null>(null);
  const [activePopup, setActivePopup] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user && location.pathname !== '/auth') {
      navigate('/auth');
    }
  }, [user, location.pathname]);

  useEffect(() => {
    if (user) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCoords(pos.coords),
        (err) => console.warn("Geolocation access withheld", err),
        { enableHighAccuracy: true }
      );
    }
  }, [user]);

  // Care Scheduler Checker
  useEffect(() => {
    if (!user || !user.isPro) return;
    
    const checkSchedule = () => {
      const reminders: PlantReminder[] = JSON.parse(localStorage.getItem('plant_reminders') || '[]');
      const savedSettings = localStorage.getItem(`flora_genius_settings_${user.id}`);
      const settings: NotificationSettings = savedSettings ? JSON.parse(savedSettings) : DEFAULT_SETTINGS;

      const now = new Date();
      const due = reminders.find(r => {
        const isDue = new Date(r.nextDue) <= now;
        const taskType = Object.keys(TASK_ICONS).includes(r.task) ? r.task as keyof NotificationSettings : 'Other';
        const isEnabled = settings[taskType];
        return isDue && isEnabled;
      });

      if (due) {
        setActivePopup(`${due.plantName} needs ${due.task.toLowerCase()}!`);
      }
    };

    const interval = setInterval(checkSchedule, 30000);
    checkSchedule();
    return () => clearInterval(interval);
  }, [user]);

  const handleLogin = (u: User) => {
    setUser(u);
    navigate('/');
  };

  const handleLogout = () => {
    authService.logout();
    setUser(null);
    navigate('/auth');
  };

  const handleUpgrade = () => {
    const freshUser = authService.getSession();
    setUser(freshUser);
  };

  if (!user && location.pathname === '/auth') {
    return <AuthScreen onLogin={handleLogin} />;
  }

  if (!user) return null;

  return (
    <div className="max-w-md mx-auto min-h-screen pb-36 pt-10 px-6 font-sans bg-plantin-bone selection:bg-plantin-sage selection:text-plantin-deep scroll-smooth">
      {activePopup && <InAppNotification message={activePopup} onClose={() => setActivePopup(null)} />}
      
      <header className="flex justify-between items-center mb-10 animate-in slide-in-from-top-6 duration-1000">
        <Link to="/" className="flex items-center gap-4 group">
          <div className="w-12 h-12 bg-plantin-leaf rounded-[1.2rem] flex items-center justify-center text-white shadow-xl border-2 border-white">
            <i className="fas fa-leaf text-xl"></i>
          </div>
          <div>
            <span className="text-2xl font-serif font-bold text-plantin-deep tracking-tighter block leading-none">FloraGenius</span>
            <span className="text-[8px] font-black text-plantin-leaf/40 uppercase tracking-[0.2em] block mt-1">AI Botanical Analyst</span>
          </div>
        </Link>
        <Link to="/profile" className="w-12 h-12 rounded-[1.2rem] bg-white shadow-sm border border-stone-100 flex items-center justify-center text-stone-300">
          <div className="w-full h-full rounded-[1.2rem] bg-plantin-soft flex items-center justify-center text-plantin-leaf font-black text-lg font-serif border-2 border-white uppercase">
            {user.name[0]}
          </div>
        </Link>
      </header>

      <main className="relative z-10">
        <Routes>
          <Route path="/" element={<HomeScreen user={user} coords={coords} />} />
          <Route path="/identify" element={<IdentifyScreen user={user} coords={coords} />} />
          <Route path="/diagnose" element={<DiagnoseScreen user={user} coords={coords} />} />
          <Route path="/reminders" element={<RemindersScreen user={user} />} />
          <Route path="/history" element={<JournalScreen user={user} />} />
          <Route path="/history/:id" element={<JournalEntryDetailScreen user={user} />} />
          <Route path="/shops" element={<ShopsScreen user={user} coords={coords} />} />
          <Route path="/profile" element={<ProfileScreen user={user} onLogout={handleLogout} onUpgrade={handleUpgrade} />} />
          <Route path="/auth" element={<AuthScreen onLogin={handleLogin} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <Nav user={user} />
    </div>
  );
};

export default App;
