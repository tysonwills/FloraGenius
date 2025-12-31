
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

// Fix syntax error on line 31: replaced 'boolean = true' with 'true'
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
  "Check soil moisture by sticking your finger 2 inches deep.",
  "Rotate your indoor plants 90 degrees every week for even growth.",
  "Wipe dust off large leaves so the plant can photosynthesize efficiently.",
  "Most houseplants prefer to be slightly root-bound.",
  "Use room-temperature water to avoid shocking the roots.",
  "Group humidity-loving plants together to create a micro-climate.",
  "Add eggshells to your soil for a natural calcium boost.",
  "Yellow leaves often mean overwatering.",
  "Use cinnamon as a natural, mild anti-fungal treatment.",
  "Let the top inch of soil dry out to break gnat cycles."
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
    ? ["Scanning structure...", "Cross-referencing...", "Analyzing ecosystem...", "Verified identity!"]
    : ["Analyzing pathology...", "Evaluating markers...", "Consulting databases...", "Diagnostic complete!"];

  useEffect(() => {
    const interval = setInterval(() => {
      setStage(s => (s < messages.length - 1 ? s + 1 : s));
    }, 2500);
    return () => clearInterval(interval);
  }, [messages.length]);

  return (
    <div className="flex flex-col items-center justify-center py-20 text-plantin-deep gap-8 animate-in fade-in duration-500">
      <div className="relative">
        <div className={`w-20 h-20 border-[3px] border-plantin-sage rounded-full animate-spin ${type === 'diagnosis' ? 'border-t-amber-500' : 'border-t-plantin-leaf'}`}></div>
        <div className="absolute inset-0 flex items-center justify-center">
          <i className={`fas ${type === 'diagnosis' ? 'fa-stethoscope text-amber-500' : 'fa-leaf text-plantin-leaf'} text-3xl animate-pulse`}></i>
        </div>
      </div>
      <div className="text-center px-6 space-y-2">
        <p className="font-serif font-bold text-2xl text-plantin-deep tracking-tight">{messages[stage]}</p>
        <div className="flex justify-center gap-1.5">
          {messages.map((_, i) => (
            <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${i <= stage ? (type === 'diagnosis' ? 'bg-amber-500' : 'bg-plantin-leaf') : 'bg-stone-200'}`}></div>
          ))}
        </div>
        <p className="text-[10px] text-stone-400 font-black uppercase tracking-[0.2em]">Botanical AI Engine</p>
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
  const confidencePercent = data.confidence ? Math.round(data.confidence * 100) : 0;
  
  return (
    <div className="space-y-4 animate-in slide-in-from-bottom duration-700 pb-16">
      <div className="bg-white rounded-[2rem] overflow-hidden shadow-xl border border-stone-100">
        {imageUrl && (
          <div className="relative h-72 md:h-96 overflow-hidden group">
            <img src={imageUrl} alt={data.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-[5s]" />
            <div className="absolute inset-0 bg-gradient-to-t from-plantin-deep/80 via-plantin-deep/20 to-transparent"></div>
            <div className="absolute bottom-6 left-6 right-6 text-white">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-block px-3 py-1 bg-plantin-leaf/50 backdrop-blur-md rounded-full text-[8px] font-black uppercase tracking-widest border border-white/20">
                  {isJournal ? 'Archive' : 'New Identification'}
                </span>
                {data.confidence && (
                   <span className="inline-block px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-[8px] font-black uppercase tracking-widest border border-white/10">
                    {confidencePercent}% Match
                  </span>
                )}
              </div>
              <h2 className="text-3xl font-serif font-bold tracking-tight mb-1">{data.name}</h2>
              <p className="text-plantin-sage font-serif italic text-lg opacity-90">{data.scientificName}</p>
            </div>
          </div>
        )}
        <div className="p-6">
          {data.isToxic && (
            <div className="bg-red-50 text-red-700 p-4 rounded-2xl flex items-start gap-3 mb-6 border border-red-100 shadow-sm">
              <i className="fas fa-biohazard text-xl shrink-0 mt-1"></i>
              <div className="flex-1">
                <p className="text-[9px] font-black uppercase tracking-widest mb-0.5">Hazard Warning</p>
                <p className="text-xs font-medium leading-relaxed">{data.toxicityDetails || "Potential irritant. Handle with care around pets."}</p>
              </div>
            </div>
          )}

          {/* New Confidence Card */}
          {data.confidence && (
            <div className="mb-6 p-4 rounded-3xl bg-plantin-soft border border-plantin-sage/20 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-plantin-leaf">
                  <i className="fas fa-circle-check text-xl"></i>
                </div>
                <div>
                  <p className="text-[8px] font-black uppercase text-stone-400 tracking-widest mb-0.5">Identification Confidence</p>
                  <p className="text-sm font-serif font-bold text-plantin-deep italic">"Highly Likely: {data.name}"</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-serif font-bold text-plantin-leaf leading-none">{confidencePercent}%</p>
                <p className="text-[7px] font-black uppercase text-plantin-leaf/50 tracking-tighter">Certainty Meter</p>
              </div>
            </div>
          )}
          
          <div className="space-y-2 mb-8 border-l-4 border-plantin-leaf pl-4">
            <h3 className="text-[9px] font-black text-plantin-leaf/40 uppercase tracking-widest">Botanist Note</h3>
            <p className="text-plantin-deep font-medium leading-relaxed text-base italic font-serif">"{data.description}"</p>
          </div>
          
          <div className="space-y-4 mb-8">
            <h3 className="font-serif font-bold text-xl text-plantin-deep flex items-center gap-2">
              <i className="fas fa-scroll text-base opacity-30"></i> Quick Facts
            </h3>
            <div className="grid gap-3">
              {data.facts.map((fact, i) => (
                <div key={i} className="flex gap-3 p-4 bg-plantin-soft/40 rounded-2xl text-plantin-deep text-xs font-medium leading-relaxed border border-stone-50">
                  <span className="w-6 h-6 rounded-lg bg-plantin-leaf flex items-center justify-center shrink-0 text-[9px] font-black text-white">{i+1}</span>
                  <p className="italic">{fact}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6 pt-6 border-t border-stone-100">
            <div className="flex justify-between items-center">
              <h3 className="font-serif font-bold text-xl text-plantin-deep">Garden Protocol</h3>
              {!user.isPro && <span className="text-[7px] bg-plantin-gold text-white px-2 py-1 rounded-full font-black uppercase tracking-widest">Pro Only</span>}
            </div>

            {user.isPro ? (
              <div className="grid grid-cols-1 gap-2.5">
                {[
                  { icon: 'fa-droplet', label: 'Hydration', value: data.careGuide.watering, color: 'text-blue-500 bg-blue-50' },
                  { icon: 'fa-sun', label: 'Luminosity', value: data.careGuide.sunlight, color: 'text-amber-500 bg-amber-50' },
                  { icon: 'fa-mountain', label: 'Substrate', value: data.careGuide.soil, color: 'text-plantin-leaf bg-plantin-soft' },
                  { icon: 'fa-temperature-half', label: 'Thermal', value: data.careGuide.temperature, color: 'text-red-400 bg-red-50' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-4 p-3.5 rounded-2xl border border-stone-50 bg-white shadow-sm">
                    <div className={`w-12 h-12 shrink-0 rounded-xl ${item.color} flex items-center justify-center text-xl`}>
                      <i className={`fas ${item.icon}`}></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[8px] font-black uppercase text-stone-300 mb-0.5 tracking-widest">{item.label}</p>
                      <p className="text-xs font-bold text-plantin-deep leading-snug">{item.value}</p>
                    </div>
                  </div>
                ))}
                
                <div className="mt-4 p-6 bg-plantin-deep rounded-3xl text-white relative overflow-hidden group">
                  <div className="relative z-10 flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center"><i className="fas fa-wand-magic-sparkles text-plantin-sage text-xl"></i></div>
                      <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-plantin-sage">Botanical Tips</h4>
                    </div>
                    <div className="grid gap-2">
                      {data.careGuide.homeRemedies.map((tip, i) => (
                        <div key={i} className="text-[11px] text-white/80 font-medium flex gap-3 bg-white/5 p-3 rounded-xl border border-white/10">
                          <i className="fas fa-sparkles text-plantin-gold text-[8px] mt-1"></i>
                          <p className="italic">{tip}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-plantin-bone rounded-3xl p-8 border-2 border-dashed border-plantin-sage text-center">
                <i className="fas fa-crown text-3xl text-plantin-gold mb-3 block"></i>
                <p className="text-base font-serif font-bold text-plantin-deep mb-2">Advanced Protocol</p>
                <p className="text-xs text-stone-400 mb-6 italic">Unlock professional moisture levels and soil science.</p>
                <Link to="/profile" className="inline-block bg-plantin-deep text-white px-6 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest">Upgrade to Pro</Link>
              </div>
            )}
          </div>

          {!isJournal && sources.length > 0 && (
            <div className="space-y-3 pt-8 border-t border-stone-100">
              <h3 className="text-[8px] font-black text-stone-300 uppercase tracking-widest text-center">Science References</h3>
              <div className="flex flex-wrap justify-center gap-2">
                {sources.map((source, i) => (
                  <a key={i} href={source.uri} target="_blank" rel="noopener noreferrer" className="text-[8px] bg-plantin-soft text-plantin-leaf px-3 py-1.5 rounded-full border border-plantin-sage/20 font-black uppercase tracking-widest">
                    {source.title}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {onReset && (
        <button onClick={onReset} className="w-full bg-plantin-deep text-white py-5 rounded-2xl font-black shadow-xl text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-transform">
           <i className="fas fa-camera text-base"></i> {isJournal ? 'Back to Gallery' : 'New Identification Scan'}
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
    if (days === 0) return { label: 'Today', color: 'text-amber-500' };
    return { label: `In ${days} day${days > 1 ? 's' : ''}`, color: 'text-plantin-leaf' };
  };

  if (!user.isPro) {
    return <ProRequiredOverlay title="Care Schedule" description="Stay consistent with hydration and fertilizer cycles." />;
  }

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom duration-700 pb-12">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-serif font-bold text-plantin-deep">Care Plans</h2>
          <p className="text-plantin-leaf font-medium text-xs italic">Nurturing cycles</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="w-12 h-12 rounded-2xl bg-plantin-leaf text-white flex items-center justify-center shadow-lg active:scale-95 transition-all"
        >
          <i className="fas fa-plus text-xl"></i>
        </button>
      </div>

      {isAdding && (
        <div className="bg-white p-6 rounded-3xl shadow-xl border border-plantin-sage/20 animate-in zoom-in duration-300">
          <h3 className="text-lg font-serif font-bold text-plantin-deep mb-4">Set Schedule</h3>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-[8px] font-black uppercase text-plantin-leaf/50 tracking-widest">Select Plant</label>
              <select 
                value={selectedPlantId}
                onChange={(e) => setSelectedPlantId(e.target.value)}
                className="w-full bg-plantin-soft border-none rounded-xl px-4 py-3 outline-none text-xs font-medium"
              >
                <option value="">Choose from Garden</option>
                {plants.map(p => (
                  <option key={p.id} value={p.id}>{p.plant.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[8px] font-black uppercase text-plantin-leaf/50 tracking-widest">Task</label>
              <div className="grid grid-cols-2 gap-2">
                {['Watering', 'Pruning', 'Rotating', 'Fertilizing', 'Mist/Clean', 'Other'].map(t => (
                  <button 
                    key={t}
                    onClick={() => setTask(t)}
                    className={`py-2 px-3 rounded-xl border text-[9px] font-black transition-all ${task === t ? 'bg-plantin-leaf text-white border-plantin-leaf' : 'bg-white text-stone-400 border-stone-100'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {task === 'Other' && (
              <input 
                type="text"
                placeholder="Describe task..."
                value={customTask}
                onChange={(e) => setCustomTask(e.target.value)}
                className="w-full bg-plantin-soft border-none rounded-xl px-4 py-3 outline-none text-xs"
              />
            )}

            <div className="space-y-1">
              <label className="text-[8px] font-black uppercase text-plantin-leaf/50 tracking-widest">Every (Days)</label>
              <input 
                type="number"
                min="1"
                value={frequency}
                onChange={(e) => setFrequency(Number(e.target.value))}
                className="w-full bg-plantin-soft border-none rounded-xl px-4 py-3 outline-none text-xs"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setIsAdding(false)} className="flex-1 bg-stone-100 text-stone-400 py-3 rounded-xl font-black text-[9px] uppercase tracking-widest">Cancel</button>
              <button onClick={handleAddReminder} className="flex-1 bg-plantin-leaf text-white py-3 rounded-xl font-black text-[9px] uppercase tracking-widest">Save Plan</button>
            </div>
          </div>
        </div>
      )}

      {reminders.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-stone-200">
          <p className="text-stone-400 font-serif italic text-sm">No active care plans.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {reminders.map((r) => {
            const status = getDayStatus(r.nextDue);
            const icon = TASK_ICONS[r.task] || 'fa-bell';
            return (
              <div key={r.id} className="bg-white p-4 rounded-3xl shadow-sm border border-stone-100 flex items-center justify-between">
                <div className="flex gap-3 items-center min-w-0">
                  <div className={`w-11 h-11 rounded-xl shrink-0 ${status.label === 'Overdue' ? 'bg-red-50 text-red-500' : 'bg-plantin-soft text-plantin-leaf'} flex items-center justify-center`}>
                    <i className={`fas ${icon} text-xl`}></i>
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm text-plantin-deep leading-tight truncate">{r.task}</h3>
                    <p className="text-[10px] text-stone-400 truncate mb-0.5">{r.plantName}</p>
                    <p className={`text-[8px] font-black uppercase tracking-widest ${status.color}`}>{status.label}</p>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                   <button onClick={() => handleComplete(r.id)} className="w-9 h-9 rounded-full bg-plantin-soft text-plantin-leaf flex items-center justify-center active:bg-plantin-leaf active:text-white transition-colors">
                    <i className="fas fa-check text-xs"></i>
                  </button>
                  <button onClick={() => handleDelete(r.id)} className="w-9 h-9 rounded-full bg-red-50 text-red-300 flex items-center justify-center active:bg-red-500 active:text-white transition-colors">
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
    <div className="min-h-screen bg-plantin-bone flex flex-col justify-center px-6 py-10 animate-in fade-in duration-700">
      <div className="text-center mb-10">
        <div className="w-16 h-16 bg-plantin-leaf rounded-2xl flex items-center justify-center text-white shadow-2xl mx-auto mb-4 border-2 border-white">
          <i className="fas fa-leaf text-3xl"></i>
        </div>
        <h1 className="text-3xl font-serif font-bold text-plantin-deep tracking-tighter">FloraGenius</h1>
        <p className="text-plantin-leaf/60 font-medium italic text-sm">"Decipher the green world."</p>
      </div>

      <div className="bg-white p-7 rounded-[2.5rem] shadow-xl border border-plantin-sage/20">
        <h2 className="text-lg font-serif font-semibold text-plantin-deep mb-6 text-center">
          {isLogin ? "Sign In" : "Join our Garden"}
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div className="space-y-1">
              <label className="text-[9px] font-black text-plantin-leaf/50 uppercase ml-3 tracking-widest">Name</label>
              <input type="text" required placeholder="Gardener Name" className="w-full bg-plantin-soft border-none rounded-xl px-4 py-3 outline-none text-xs font-medium" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
          <div className="space-y-1">
            <label className="text-[9px] font-black text-plantin-leaf/50 uppercase ml-3 tracking-widest">Email</label>
            <input type="email" required placeholder="nature@example.com" className="w-full bg-plantin-soft border-none rounded-xl px-4 py-3 outline-none text-xs font-medium" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-plantin-leaf/50 uppercase ml-3 tracking-widest">Password</label>
            <input type="password" required placeholder="••••••••" className="w-full bg-plantin-soft border-none rounded-xl px-4 py-3 outline-none text-xs font-medium" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          {error && <p className="text-red-500 text-[10px] font-bold text-center">{error}</p>}

          <button type="submit" className="w-full bg-plantin-leaf text-white py-4 rounded-2xl font-black shadow-lg text-[10px] uppercase tracking-widest mt-2 active:scale-95 transition-transform">
            {isLogin ? "Enter Garden" : "Plant Root"}
          </button>
        </form>

        <button onClick={() => setIsLogin(!isLogin)} className="w-full text-[10px] text-plantin-leaf font-black mt-6 uppercase tracking-widest opacity-60">
          {isLogin ? "Join the community" : "Back to login"}
        </button>
      </div>
    </div>
  );
};

// --- Feature Components ---

const ProRequiredOverlay = ({ title, description }: { title?: string, description?: string }) => (
  <div className="bg-white rounded-3xl p-8 text-center space-y-4 shadow-xl border border-stone-50">
    <div className="w-16 h-16 bg-plantin-soft rounded-full flex items-center justify-center text-plantin-gold mx-auto">
      <i className="fas fa-crown text-3xl"></i>
    </div>
    <div className="space-y-1">
      <h3 className="text-xl font-serif font-bold text-plantin-deep">{title || "Premium Feature"}</h3>
      <p className="text-stone-500 font-medium italic text-xs leading-relaxed">"{description || "This feature is reserved for our Pro members."}"</p>
    </div>
    <Link to="/profile" className="inline-block bg-plantin-leaf text-white px-8 py-3.5 rounded-xl font-black shadow-lg text-[9px] uppercase tracking-widest">
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
          <h2 className="text-3xl font-serif font-bold text-plantin-deep">Garden Hub</h2>
          <p className="text-plantin-leaf font-medium text-xs italic">Digital herbarium</p>
        </div>
        <div className="w-11 h-11 rounded-xl bg-plantin-soft flex items-center justify-center text-plantin-leaf">
          <i className="fas fa-book-leaf text-xl"></i>
        </div>
      </div>
      
      {journal.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-stone-200">
          <p className="text-stone-400 font-serif italic text-sm mb-4">Your sanctuary is waiting.</p>
          <Link to="/identify" className="inline-block bg-plantin-leaf text-white px-5 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-md">
            Scan First Plant
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {journal.map((item) => (
            <Link key={item.id} to={`/history/${item.id}`} className="bg-white p-3 rounded-[1.8rem] shadow-sm border border-stone-50 flex items-center gap-4 active:scale-98 transition-transform">
              <div className="w-16 h-16 rounded-2xl overflow-hidden bg-plantin-soft shrink-0 border-2 border-white shadow-sm">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.plant.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-plantin-leaf/30"><i className="fas fa-image"></i></div>
                )}
              </div>
              <div className="flex-1 min-w-0 pr-2">
                <div className="flex justify-between items-start mb-0.5">
                  <h3 className="font-bold text-sm text-plantin-deep truncate">{item.plant.name}</h3>
                  <span className="text-[7px] font-black text-stone-300 uppercase shrink-0">{new Date(item.timestamp).toLocaleDateString()}</span>
                </div>
                <p className="text-[10px] text-plantin-leaf font-serif italic truncate opacity-70 mb-1.5">{item.plant.scientificName}</p>
                <div className="flex gap-1.5">
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
    if (found) setEntry(found);
    else navigate('/history');
  }, [id, navigate]);

  if (!entry) return null;

  return (
    <div className="animate-in fade-in duration-700">
      <BotanicalResultView data={entry.plant} imageUrl={entry.imageUrl} sources={[]} user={user} isJournal={true} onReset={() => navigate('/history')} />
    </div>
  );
};

const ShopsScreen = ({ user, coords }: { user: User, coords: GeolocationCoordinates | null }) => {
  const [loading, setLoading] = useState(false);
  const [centers, setCenters] = useState<GroundingSource[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user.isPro) {
      if (coords) fetchShops(coords.latitude, coords.longitude);
      else {
        setLoading(true);
        navigator.geolocation.getCurrentPosition(
          (pos) => fetchShops(pos.coords.latitude, pos.coords.longitude),
          () => { setError("Location access denied."); setLoading(false); }
        );
      }
    }
  }, [user.isPro, coords]);

  const fetchShops = async (lat: number, lng: number) => {
    setLoading(true);
    try {
      const { centers } = await getNearbyGardenCenters(lat, lng);
      setCenters(centers);
    } catch (e) { setError("Discovery failed."); }
    finally { setLoading(false); }
  };

  if (!user.isPro) return <ProRequiredOverlay title="Elite Nurseries" description="Find professional botanical supplies near you." />;

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom duration-700">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-serif font-bold text-plantin-deep">Supplies</h2>
          <p className="text-plantin-leaf font-medium text-xs italic">Local garden centers</p>
        </div>
        <div className="w-11 h-11 rounded-xl bg-plantin-leaf text-white flex items-center justify-center shadow-lg"><i className="fas fa-map-pin text-xl"></i></div>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border-3 border-plantin-sage border-t-plantin-leaf rounded-full animate-spin"></div>
          <p className="font-serif italic text-stone-400 text-sm">Mapping nurseries...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 p-4 rounded-2xl text-red-600 text-xs font-medium border border-red-100 flex items-center gap-3">
          <i className="fas fa-circle-exclamation text-base"></i><p>{error}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {centers.map((center, i) => (
            <a key={i} href={center.uri} target="_blank" rel="noopener noreferrer" className="bg-white p-4 rounded-[1.8rem] shadow-sm border border-stone-50 flex items-center justify-between active:scale-98 transition-transform">
              <div className="flex gap-3 items-center min-w-0">
                <div className="w-10 h-10 bg-plantin-soft rounded-xl flex items-center justify-center text-plantin-leaf shrink-0"><i className="fas fa-tree text-lg"></i></div>
                <div className="min-w-0">
                  <h3 className="font-bold text-sm text-plantin-deep leading-tight truncate">{center.title}</h3>
                  <span className="text-[7px] text-plantin-leaf font-black uppercase tracking-widest opacity-60">Garden Supply</span>
                </div>
              </div>
              <i className="fas fa-chevron-right text-xs text-stone-200 shrink-0 ml-4"></i>
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
    try { setLocalFlora(await getLocalFlora(coords.latitude, coords.longitude)); }
    catch (e) { console.error(e); }
    finally { setLoadingFlora(false); }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <div className="relative overflow-hidden rounded-[2.5rem] bg-plantin-deep text-white shadow-2xl">
        <div className="relative h-56 w-full overflow-hidden">
          <img src="https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&q=80&w=1200" alt="Nature" className="w-full h-full object-cover opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-t from-plantin-deep via-plantin-deep/10 to-transparent"></div>
          <div className="absolute top-4 right-4 bg-plantin-leaf/30 backdrop-blur-xl px-3 py-1.5 rounded-full text-[7px] font-black uppercase tracking-widest border border-white/10 flex items-center gap-2">
            <i className={`fas fa-leaf ${coords ? 'text-emerald-400' : 'text-white'} animate-pulse text-[11px]`}></i>
            {coords ? 'Regional Habitat' : 'Flora AI'}
          </div>
        </div>

        <div className="px-6 pb-6 pt-0 relative z-10 -mt-12">
          <h1 className="text-3xl font-serif font-bold mb-1 tracking-tight leading-tight">{user.name.split(' ')[0]}<span className="text-plantin-sage">.</span></h1>
          <p className="text-plantin-sage font-medium text-sm italic opacity-80 leading-snug">What secrets shall we uncover today?</p>
          
          <div className="mt-6 flex gap-2.5">
            <Link to="/identify" className="flex-1 bg-white text-plantin-deep px-3 py-3.5 rounded-xl font-black text-center shadow-lg text-[9px] uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-transform">
              <i className="fas fa-camera text-base"></i> Identify
            </Link>
            <Link to="/diagnose" className="flex-1 bg-plantin-leaf text-white px-3 py-3.5 rounded-xl font-black text-center shadow-lg text-[9px] uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-transform">
              <i className="fas fa-stethoscope text-base"></i> Diagnose
            </Link>
          </div>
        </div>
      </div>

      {user.isPro && coords && (
        <section className="bg-white p-6 rounded-[2rem] border border-plantin-sage/20 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2.5">
               <div className="w-9 h-9 bg-plantin-soft rounded-xl flex items-center justify-center text-plantin-leaf"><i className="fas fa-mountain-sun text-xl"></i></div>
               <h3 className="font-serif font-bold text-lg text-plantin-deep">Eco-Scan</h3>
            </div>
            <button onClick={discoverFlora} disabled={loadingFlora} className="w-8 h-8 bg-plantin-soft rounded-full flex items-center justify-center text-plantin-leaf active:rotate-180 transition-transform">
              <i className={`fas fa-arrows-rotate text-xs ${loadingFlora ? 'animate-spin' : ''}`}></i>
            </button>
          </div>
          
          {localFlora ? (
            <div className="animate-in fade-in duration-500">
              <p className="text-[11px] text-plantin-deep font-medium leading-relaxed italic mb-4 border-l-2 border-plantin-sage pl-3">"{localFlora.text}"</p>
              <div className="flex flex-wrap gap-1.5">
                {localFlora.sources.slice(0, 3).map((s, i) => (
                  <span key={i} className="text-[7px] bg-plantin-soft text-plantin-leaf px-2 py-1 rounded-full font-black uppercase tracking-widest border border-stone-50">{s.title}</span>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-4 bg-stone-50/50 rounded-2xl">
              <p className="text-[10px] mb-4 font-serif italic text-stone-400 px-4">See which botanical species thrive in your climate.</p>
              <button onClick={discoverFlora} className="bg-plantin-deep text-white px-6 py-2 rounded-lg text-[8px] font-black uppercase tracking-widest active:scale-95 transition-transform">Start Eco-Scan</button>
            </div>
          )}
        </section>
      )}

      <section className="px-1">
        <h2 className="text-lg font-serif font-bold text-plantin-deep mb-4">Quick Tools</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: 'fa-user-md', label: 'Doctor', path: '/diagnose', pro: true, desc: 'Heal' },
            { icon: 'fa-calendar-check', label: 'Schedule', path: '/reminders', pro: true, desc: 'Care' },
            { icon: 'fa-seedling', label: 'Garden', path: '/history', desc: 'Herbarium' },
            { icon: 'fa-store-alt', label: 'Shops', path: '/shops', pro: true, desc: 'Supplies' },
          ].map((feat, i) => (
            <Link key={i} to={feat.path} className="p-4 rounded-3xl bg-white border border-stone-50 flex flex-col items-center gap-2 shadow-sm active:scale-98 transition-transform">
              <div className="w-10 h-10 rounded-xl bg-plantin-soft flex items-center justify-center text-xl relative">
                <i className={`fas ${feat.icon}`}></i>
                {feat.pro && !user.isPro && <i className="fas fa-crown absolute -top-1 -right-1 text-[8px] text-plantin-gold"></i>}
              </div>
              <div className="text-center">
                <span className="text-[11px] font-bold text-plantin-deep block">{feat.label}</span>
                <span className="text-[8px] font-medium text-stone-300 block">{feat.desc}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="bg-plantin-deep rounded-[2rem] p-8 text-center gap-4 flex flex-col items-center relative overflow-hidden">
        <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-white"><i className="fas fa-spa text-2xl"></i></div>
        <p className="text-base font-serif font-medium text-white italic leading-relaxed">"{botanicalTip}"</p>
        <p className="text-[8px] font-black uppercase text-plantin-sage opacity-40 tracking-widest">Botanist Strategy</p>
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
      
      const newEntry: JournalEntry = { id: crypto.randomUUID(), timestamp: new Date().toISOString(), plant: res.data, imageUrl: finalImage };
      const journal = JSON.parse(localStorage.getItem('plant_journal') || '[]');
      localStorage.setItem('plant_journal', JSON.stringify([newEntry, ...journal].slice(0, 15)));
      setResult({ ...res, referenceImage });
    } catch (error) { alert("Analysis failed. Try again."); }
    finally { setLoading(false); }
  };

  if (loading) return <BotanicalLoader type="identification" />;

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      {!result ? (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
             <h2 className="text-3xl font-serif font-bold text-plantin-deep">Identify</h2>
             <i className="fas fa-magnifying-glass-leaf text-2xl text-plantin-leaf"></i>
          </div>
          
          <div className="space-y-1.5">
            <label className="text-[8px] font-black uppercase text-plantin-leaf/50 tracking-widest ml-1">Contextual Clues</label>
            <textarea placeholder="e.g. Fragrant flowers, found in partial shade..." className="w-full bg-white border border-stone-100 rounded-2xl px-4 py-3 outline-none text-xs min-h-[80px] shadow-sm" value={observations} onChange={(e) => setObservations(e.target.value)} />
          </div>

          <CameraCapture label="Snap Specimen Photo" onCapture={handleIdentify} />
          <div className="bg-plantin-soft/50 p-5 rounded-2xl border border-plantin-sage/20">
             <p className="text-center text-[10px] font-serif italic text-plantin-deep/60 leading-relaxed">Capture any leaf, flower, or bark to unveil its species. Region-aware AI provides precise localized data.</p>
          </div>
        </div>
      ) : (
        <BotanicalResultView data={result.data} imageUrl={result.referenceImage || null} sources={result.sources} user={user} onReset={() => setResult(null)} />
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
      localStorage.setItem('plant_history', JSON.stringify([res.data, ...history].slice(0, 10)));
    } catch (error) { alert("Diagnostic scan failed."); }
    finally { setLoading(false); }
  };

  if (!user.isPro) return <ProRequiredOverlay title="Plant Physician" description="Heal wilting leaves and manage fungal infections with AI pathology." />;
  if (loading) return <BotanicalLoader type="diagnosis" />;

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      {!result ? (
        <div className="space-y-6">
           <div className="flex justify-between items-center">
             <h2 className="text-3xl font-serif font-bold text-plantin-deep">Diagnose</h2>
             <i className="fas fa-staff-snake text-2xl text-amber-500"></i>
          </div>
          <CameraCapture label="Scan Symptomatic Leaves" onCapture={handleDiagnose} />
          <div className="bg-amber-50/40 p-5 rounded-2xl border border-amber-100/50">
             <p className="text-center text-[10px] font-serif italic text-amber-900/60 leading-relaxed">Instantly identify pests, spotting, or rot. AI Pathology scans for precise fungal markers.</p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-[2rem] p-6 shadow-xl border-l-[10px] border-l-amber-500 animate-in zoom-in duration-700">
          <div className="mb-6">
            <span className="text-[8px] bg-amber-50 text-amber-700 px-3 py-1 rounded-full font-black uppercase tracking-widest mb-3 inline-block">Diagnostic Found</span>
            <h2 className="text-2xl font-serif font-bold text-plantin-deep mb-0.5 leading-tight">{result.data.plantName}</h2>
            <p className="text-lg font-serif italic text-amber-600 font-semibold">{result.data.issue}</p>
          </div>
          
          <div className="space-y-6">
            <div className="p-5 bg-plantin-soft/40 rounded-3xl border border-plantin-sage/10">
              <h4 className="text-[8px] font-black uppercase text-plantin-leaf mb-4 tracking-widest text-center">Treatment Actions</h4>
              <ul className="grid gap-3">
                {result.data.recommendations.map((r, i) => (
                  <li key={i} className="text-[11px] font-medium text-plantin-deep flex gap-3 bg-white p-3.5 rounded-2xl shadow-sm border border-stone-50">
                    <i className="fas fa-hand-holding-medical text-plantin-leaf mt-0.5 text-xs"></i>
                    <p className="flex-1 italic leading-relaxed">{r}</p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid grid-cols-2 gap-3">
               <div className="p-4 bg-stone-50 rounded-2xl text-center">
                  <p className="text-[8px] font-black text-stone-300 uppercase tracking-widest mb-1">Match</p>
                  <p className="text-xl font-serif font-bold text-plantin-leaf">{(result.data.confidence * 100).toFixed(0)}%</p>
               </div>
               <div className="p-4 bg-stone-50 rounded-2xl text-center">
                  <p className="text-[8px] font-black text-stone-300 uppercase tracking-widest mb-1">Status</p>
                  <p className="text-[10px] font-serif font-bold text-plantin-deep italic leading-tight">{result.data.prognosis}</p>
               </div>
            </div>
          </div>
          <button onClick={() => setResult(null)} className="w-full bg-plantin-deep text-white py-5 rounded-2xl font-black shadow-lg text-[10px] mt-8 flex items-center justify-center gap-2 active:scale-95 transition-transform uppercase tracking-widest">
             <i className="fas fa-rotate text-base"></i> New Diagnostic Scan
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
    try { authService.upgradeToPro(user.id); onUpgrade(); }
    catch (e) { console.error(e); }
    finally { setUpgrading(false); }
  };

  const toggleNotif = (key: keyof NotificationSettings) => {
    const updated = { ...notifSettings, [key]: !notifSettings[key] };
    setNotifSettings(updated);
    localStorage.setItem(`flora_genius_settings_${user.id}`, JSON.stringify(updated));
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom duration-700">
      <div className="flex justify-between items-end">
        <h2 className="text-3xl font-serif font-bold text-plantin-deep">Settings</h2>
        <div className="w-10 h-10 rounded-xl bg-plantin-soft flex items-center justify-center text-plantin-leaf"><i className="fas fa-id-badge text-xl"></i></div>
      </div>

      <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-stone-50 space-y-8">
        <div className="flex flex-col items-center gap-4">
          <div className="w-24 h-24 rounded-3xl bg-plantin-leaf flex items-center justify-center text-white text-4xl font-serif font-black shadow-xl border-4 border-white">
            {user.name[0]}
          </div>
          <div className="text-center">
            <h3 className="text-2xl font-serif font-bold text-plantin-deep tracking-tight">{user.name}</h3>
            <p className="text-stone-300 font-medium uppercase text-[9px] tracking-widest">{user.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-2xl bg-stone-50 text-center border border-stone-100">
            <p className="text-[8px] font-black uppercase text-stone-300 mb-1 tracking-widest">Plan</p>
            <span className={`text-xs font-black uppercase ${user.isPro ? 'text-plantin-leaf' : 'text-stone-400'}`}>{user.isPro ? 'Pro member' : 'Free tier'}</span>
          </div>
          <div className="p-4 rounded-2xl bg-stone-50 text-center border border-stone-100">
            <p className="text-[8px] font-black uppercase text-stone-300 mb-1 tracking-widest">Status</p>
            <span className="text-xs font-black uppercase text-plantin-deep">Verified</span>
          </div>
        </div>

        {user.isPro && (
          <div className="space-y-4 pt-4 border-t border-stone-50">
            <h4 className="text-[8px] font-black text-stone-300 uppercase tracking-widest text-center">Preferences</h4>
            <div className="grid gap-2">
              {(Object.keys(DEFAULT_SETTINGS) as Array<keyof NotificationSettings>).map(key => (
                <button key={key} onClick={() => toggleNotif(key)} className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${notifSettings[key] ? 'bg-plantin-soft border-plantin-sage text-plantin-deep' : 'bg-white border-stone-100 text-stone-300'}`}>
                  <div className="flex items-center gap-3">
                    <i className={`fas ${TASK_ICONS[key] || 'fa-bell'} text-sm ${notifSettings[key] ? 'text-plantin-leaf' : ''}`}></i>
                    <span className="text-[11px] font-bold">{key}</span>
                  </div>
                  <div className={`w-8 h-4 rounded-full relative transition-colors ${notifSettings[key] ? 'bg-plantin-leaf' : 'bg-stone-100'}`}>
                    <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${notifSettings[key] ? 'right-0.5' : 'left-0.5'}`}></div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {!user.isPro && (
          <div className="bg-plantin-deep p-6 rounded-3xl text-white shadow-lg text-center">
              <h4 className="text-lg font-serif font-bold mb-2">Master Botanist</h4>
              <p className="text-[10px] text-plantin-sage opacity-70 mb-6 italic leading-relaxed">Unlimited diagnostics and ecology mapping suite.</p>
              <button onClick={handleUpgrade} disabled={upgrading} className="w-full bg-white text-plantin-deep py-3 rounded-xl font-black text-[9px] uppercase tracking-widest active:scale-95 transition-transform">
                {upgrading ? 'Unlocking...' : 'Unlock Suite - $9.99'}
              </button>
          </div>
        )}

        <button onClick={onLogout} className="w-full text-stone-300 text-[9px] font-black uppercase tracking-[0.2em] hover:text-red-500 transition-colors pt-6 border-t border-stone-50">Sign Out</button>
      </div>
    </div>
  );
};

const Nav = ({ user }: { user: User }) => {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path || (path === '/history' && location.pathname.startsWith('/history/'));

  return (
    <nav className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[90%] max-w-sm glass rounded-3xl px-6 py-4 flex justify-between items-center z-50 shadow-2xl border border-white/60">
      <Link to="/" className={`transition-all duration-300 ${isActive('/') && !location.pathname.startsWith('/history') && !location.pathname.startsWith('/reminders') ? 'text-plantin-leaf scale-125' : 'text-stone-300'}`}><i className="fas fa-seedling text-xl"></i></Link>
      <Link to="/reminders" className={`relative transition-all duration-300 ${isActive('/reminders') ? 'text-plantin-leaf scale-125' : 'text-stone-300'}`}><i className="fas fa-calendar-check text-xl"></i>{!user.isPro && <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-plantin-gold rounded-full border border-white"></div>}</Link>
      <div className="relative">
        <Link to="/diagnose" className="w-12 h-12 bg-plantin-leaf rounded-full flex items-center justify-center text-white shadow-xl -mt-12 border-4 border-plantin-bone active:scale-90 transition-transform"><i className="fas fa-stethoscope text-xl"></i></Link>
      </div>
      <Link to="/history" className={`transition-all duration-300 ${isActive('/history') ? 'text-plantin-leaf scale-125' : 'text-stone-300'}`}><i className="fas fa-book-leaf text-xl"></i></Link>
      <Link to="/profile" className={`transition-all duration-300 ${isActive('/profile') ? 'text-plantin-leaf scale-125' : 'text-stone-300'}`}><i className="fas fa-user-circle text-xl"></i></Link>
    </nav>
  );
};

// --- App Root ---

const InAppNotification = ({ message, onClose }: { message: string, onClose: () => void }) => (
  <div className="fixed top-6 left-1/2 -translate-x-1/2 w-[88%] max-w-sm bg-plantin-deep text-white p-4 rounded-2xl shadow-2xl z-[100] animate-in slide-in-from-top duration-500 flex items-center gap-3 border border-white/10">
    <div className="w-8 h-8 rounded-full bg-plantin-leaf flex items-center justify-center shrink-0"><i className="fas fa-bell text-xs"></i></div>
    <div className="flex-1 min-w-0">
      <p className="text-[7px] font-black uppercase text-plantin-sage tracking-widest mb-0.5">Care Schedule</p>
      <p className="text-[11px] font-medium leading-tight truncate">{message}</p>
    </div>
    <button onClick={onClose} className="opacity-40 px-2"><i className="fas fa-xmark text-xs"></i></button>
  </div>
);

const App = () => {
  const [user, setUser] = useState<User | null>(authService.getSession());
  const [coords, setCoords] = useState<GeolocationCoordinates | null>(null);
  const [activePopup, setActivePopup] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => { if (!user && location.pathname !== '/auth') navigate('/auth'); }, [user, location.pathname]);

  useEffect(() => {
    if (user) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCoords(pos.coords),
        (err) => console.warn("Geo restricted", err),
        { enableHighAccuracy: true }
      );
    }
  }, [user]);

  useEffect(() => {
    if (!user || !user.isPro) return;
    const checkSchedule = () => {
      const reminders: PlantReminder[] = JSON.parse(localStorage.getItem('plant_reminders') || '[]');
      const savedSettings = localStorage.getItem(`flora_genius_settings_${user.id}`);
      const settings: NotificationSettings = savedSettings ? JSON.parse(savedSettings) : DEFAULT_SETTINGS;
      const now = new Date();
      const due = reminders.find(r => (new Date(r.nextDue) <= now) && (settings[Object.keys(TASK_ICONS).includes(r.task) ? r.task as keyof NotificationSettings : 'Other']));
      if (due) setActivePopup(`${due.plantName} needs ${due.task}!`);
    };
    const interval = setInterval(checkSchedule, 60000);
    checkSchedule();
    return () => clearInterval(interval);
  }, [user]);

  const handleLogin = (u: User) => { setUser(u); navigate('/'); };
  const handleLogout = () => { authService.logout(); setUser(null); navigate('/auth'); };
  const handleUpgrade = () => { setUser(authService.getSession()); };

  if (!user && location.pathname === '/auth') return <AuthScreen onLogin={handleLogin} />;
  if (!user) return null;

  return (
    <div className="max-w-md mx-auto min-h-screen pb-28 pt-8 px-5 font-sans bg-plantin-bone scroll-smooth">
      {activePopup && <InAppNotification message={activePopup} onClose={() => setActivePopup(null)} />}
      
      <header className="flex justify-between items-center mb-8 px-1 animate-in slide-in-from-top duration-700">
        <Link to="/" className="flex items-center gap-3">
          <div className="w-10 h-10 bg-plantin-leaf rounded-xl flex items-center justify-center text-white shadow-lg border-2 border-white"><i className="fas fa-leaf text-xl"></i></div>
          <span className="text-xl font-serif font-bold text-plantin-deep tracking-tight">FloraGenius</span>
        </Link>
        <Link to="/profile" className="w-10 h-10 rounded-xl bg-plantin-soft flex items-center justify-center text-plantin-leaf font-black font-serif border-2 border-white uppercase shadow-sm">{user.name[0]}</Link>
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
