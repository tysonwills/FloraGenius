
import React, { useState, useEffect, useMemo } from 'react';
import { Routes, Route, Link, useLocation, useNavigate, Navigate, useParams } from 'react-router-dom';
import CameraCapture from './components/CameraCapture';
import { identifyPlant, diagnosePlant, getNearbyGardenCenters, generatePlantImage, getLocalFlora } from './services/geminiService';
import { authService } from './services/authService';
import { PlantIdentification, PlantDiagnosis, GroundingSource, User, JournalEntry, PlantReminder } from './types';

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
    <div className="space-y-10 animate-in slide-in-from-bottom duration-700 pb-16">
      <div className="bg-white rounded-[4.5rem] overflow-hidden shadow-2xl border border-stone-100">
        {imageUrl && (
          <div className="relative h-[32rem] overflow-hidden group">
            <img src={imageUrl} alt={data.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-[5s] ease-in-out" />
            <div className="absolute inset-0 bg-gradient-to-t from-plantin-deep via-plantin-deep/20 to-transparent"></div>
            <div className="absolute bottom-12 left-12 right-12 text-white">
              <div className="flex items-center gap-3 mb-6">
                <span className="px-5 py-2 bg-plantin-leaf/40 backdrop-blur-2xl rounded-full text-[10px] font-black uppercase tracking-[0.3em] border border-white/20 shadow-2xl">
                  {isJournal ? 'Saved Entry' : 'Verified Identity'}
                </span>
              </div>
              <h2 className="text-7xl font-serif font-bold tracking-tight mb-3 leading-none">{data.name}</h2>
              <p className="text-plantin-sage font-serif italic text-3xl opacity-90">{data.scientificName}</p>
            </div>
          </div>
        )}
        <div className="p-12">
          {data.isToxic && (
            <div className="bg-red-50 text-red-700 p-8 rounded-[3rem] flex items-start gap-6 mb-12 border border-red-100 shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:rotate-12 transition-transform">
                <i className="fas fa-skull-crossbones text-8xl"></i>
              </div>
              <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center text-red-600 shrink-0 relative z-10">
                <i className="fas fa-biohazard text-2xl"></i>
              </div>
              <div className="relative z-10">
                <p className="text-[11px] font-black uppercase tracking-[0.3em] mb-2">Botanical Hazard</p>
                <p className="text-base font-medium leading-relaxed">{data.toxicityDetails || "Caution: This species contains specialized toxins. Keep away from pets and children."}</p>
              </div>
            </div>
          )}
          
          <div className="space-y-4 mb-12 border-l-4 border-plantin-leaf pl-8">
            <h3 className="text-[11px] font-black text-plantin-leaf/40 uppercase tracking-[0.4em]">Botanical Journal</h3>
            <p className="text-plantin-deep font-medium leading-[1.8] text-2xl italic font-serif">"{data.description}"</p>
          </div>
          
          <div className="space-y-10 mb-16">
            <h3 className="font-serif font-bold text-3xl text-plantin-deep flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-plantin-soft flex items-center justify-center">
                <i className="fas fa-scroll text-sm opacity-40"></i>
              </div>
              Species Chronicle
            </h3>
            <div className="grid gap-6">
              {data.facts.map((fact, i) => (
                <div key={i} className="flex gap-6 p-8 bg-plantin-soft/50 rounded-[2.5rem] text-plantin-deep text-base font-medium leading-relaxed hover:bg-white hover:shadow-xl transition-all border border-transparent hover:border-plantin-sage/20">
                  <span className="w-10 h-10 rounded-2xl bg-plantin-leaf flex items-center justify-center shrink-0 text-xs font-black text-white shadow-xl">{i+1}</span>
                  <p className="pt-1 italic leading-relaxed">{fact}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-10 mb-10 pt-12 border-t border-stone-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-serif font-bold text-4xl text-plantin-deep">Garden Protocol</h3>
              {!user.isPro && <span className="text-[10px] bg-plantin-gold text-white px-5 py-2 rounded-full font-black uppercase tracking-[0.3em] shadow-2xl shadow-plantin-gold/20">Upgrade Protocol</span>}
            </div>

            {user.isPro ? (
              <div className="grid grid-cols-2 gap-6 animate-in fade-in duration-1000">
                {[
                  { icon: 'fa-droplet', label: 'Hydration', value: data.careGuide.watering, color: 'text-blue-500 bg-blue-50' },
                  { icon: 'fa-sun', label: 'Luminosity', value: data.careGuide.sunlight, color: 'text-amber-500 bg-amber-50' },
                  { icon: 'fa-flask-vial', label: 'Substrate', value: data.careGuide.soil, color: 'text-plantin-leaf bg-plantin-soft' },
                  { icon: 'fa-temperature-arrow-up', label: 'Thermal', value: data.careGuide.temperature, color: 'text-red-400 bg-red-50' },
                ].map((item, i) => (
                  <div key={i} className="p-8 rounded-[3rem] border border-stone-50 bg-white shadow-sm hover:shadow-2xl transition-all group">
                    <div className={`w-14 h-14 rounded-[1.5rem] ${item.color} flex items-center justify-center text-xl mb-6 shadow-inner group-hover:scale-110 transition-transform`}>
                      <i className={`fas ${item.icon}`}></i>
                    </div>
                    <p className="text-[10px] font-black uppercase text-stone-300 mb-2 tracking-[0.3em]">{item.label}</p>
                    <p className="text-sm font-bold text-plantin-deep leading-relaxed">{item.value}</p>
                  </div>
                ))}
                <div className="col-span-2 mt-8 p-10 bg-plantin-deep rounded-[4rem] border border-white/5 shadow-2xl relative overflow-hidden group">
                  <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/5 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-1000"></div>
                  <div className="flex flex-col items-center gap-6 relative z-10">
                    <div className="w-16 h-16 bg-white/10 backdrop-blur-xl border border-white/20 rounded-full flex items-center justify-center text-plantin-sage shadow-2xl">
                      <i className="fas fa-wand-magic-sparkles text-2xl"></i>
                    </div>
                    <h4 className="text-[11px] font-black uppercase text-plantin-sage/60 tracking-[0.4em]">Ancient Remedies & Care Hacks</h4>
                    <div className="grid gap-5 w-full">
                      {data.careGuide.homeRemedies.map((tip, i) => (
                        <div key={i} className="text-base text-white/80 font-medium flex gap-6 bg-white/5 p-6 rounded-[2rem] border border-white/10 hover:bg-white/10 transition-colors">
                          <i className="fas fa-sparkles text-plantin-gold mt-1 text-sm"></i>
                          <p className="italic">{tip}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative overflow-hidden rounded-[4rem] bg-plantin-bone p-16 border-2 border-dashed border-plantin-sage group">
                <div className="flex flex-col items-center justify-center text-center relative z-10">
                  <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center text-plantin-gold mb-8 shadow-[0_0_60px_rgba(212,175,55,0.3)] group-hover:scale-110 transition-transform">
                    <i className="fas fa-crown text-3xl"></i>
                  </div>
                  <p className="text-3xl font-serif font-bold text-plantin-deep mb-4">Elite Care Database</p>
                  <p className="text-base text-stone-400 mb-10 font-medium leading-relaxed italic max-w-sm">Elevate your gardening mastery with professional-grade schedules, precision lighting data, and legendary home remedies.</p>
                  <Link to="/profile" className="bg-plantin-deep text-white px-12 py-5 rounded-[2rem] text-[11px] font-black uppercase tracking-[0.3em] shadow-2xl shadow-plantin-deep/40 hover:bg-plantin-leaf transition-all">Unlock Premium Suite</Link>
                </div>
              </div>
            )}
          </div>

          {!isJournal && sources.length > 0 && (
            <div className="space-y-6 pt-12 border-t border-stone-100">
              <h3 className="text-[10px] font-black text-stone-300 uppercase tracking-[0.4em] text-center">Verified Botanical Sources</h3>
              <div className="flex flex-wrap justify-center gap-4">
                {sources.map((source, i) => (
                  <a 
                    key={i} 
                    href={source.uri} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-[10px] bg-plantin-soft text-plantin-leaf px-6 py-3 rounded-full border border-plantin-sage/20 hover:bg-white transition-all flex items-center gap-3 font-black uppercase tracking-widest shadow-sm hover:shadow-xl"
                  >
                    <i className="fas fa-link text-[8px] opacity-40"></i> {source.title}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {onReset && (
        <button onClick={onReset} className="w-full bg-plantin-deep text-white py-8 rounded-[3rem] font-black shadow-2xl hover:bg-plantin-leaf transition-all uppercase tracking-[0.3em] text-[11px] active:scale-95 flex items-center justify-center gap-3">
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
    <div className="space-y-8 animate-in slide-in-from-bottom duration-700 pb-12">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-4xl font-serif font-bold text-plantin-deep">Care Plans</h2>
          <p className="text-plantin-leaf font-medium text-sm italic">Keep your garden thriving</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="w-14 h-14 rounded-2xl bg-plantin-leaf text-white flex items-center justify-center shadow-lg shadow-plantin-leaf/20 hover:scale-105 active:scale-95 transition-all"
        >
          <i className="fas fa-plus text-xl"></i>
        </button>
      </div>

      {isAdding && (
        <div className="bg-white p-10 rounded-[3rem] shadow-2xl border border-plantin-sage/20 animate-in zoom-in duration-300">
          <h3 className="text-2xl font-serif font-bold text-plantin-deep mb-6">New Reminder</h3>
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-plantin-leaf/50 tracking-widest ml-2">Which Plant?</label>
              <select 
                value={selectedPlantId}
                onChange={(e) => setSelectedPlantId(e.target.value)}
                className="w-full bg-plantin-soft border-none rounded-2xl px-5 py-4 focus:ring-2 focus:ring-plantin-leaf outline-none font-medium"
              >
                <option value="">Select from your garden</option>
                {plants.map(p => (
                  <option key={p.id} value={p.id}>{p.plant.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-plantin-leaf/50 tracking-widest ml-2">Task Type</label>
              <div className="grid grid-cols-2 gap-3">
                {['Watering', 'Pruning', 'Rotating', 'Fertilizing', 'Mist/Clean', 'Other'].map(t => (
                  <button 
                    key={t}
                    onClick={() => setTask(t)}
                    className={`py-3 px-4 rounded-xl border text-xs font-bold transition-all ${task === t ? 'bg-plantin-leaf text-white border-plantin-leaf' : 'bg-white text-stone-400 border-stone-100 hover:border-plantin-leaf'}`}
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
                className="w-full bg-plantin-soft border-none rounded-2xl px-5 py-4 focus:ring-2 focus:ring-plantin-leaf outline-none"
              />
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-plantin-leaf/50 tracking-widest ml-2">Frequency (Every X Days)</label>
              <input 
                type="number"
                min="1"
                value={frequency}
                onChange={(e) => setFrequency(Number(e.target.value))}
                className="w-full bg-plantin-soft border-none rounded-2xl px-5 py-4 focus:ring-2 focus:ring-plantin-leaf outline-none"
              />
            </div>

            <div className="flex gap-4 pt-4">
              <button 
                onClick={() => setIsAdding(false)}
                className="flex-1 bg-stone-100 text-stone-400 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest"
              >
                Cancel
              </button>
              <button 
                onClick={handleAddReminder}
                className="flex-1 bg-plantin-leaf text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-plantin-leaf/20"
              >
                Save Protocol
              </button>
            </div>
          </div>
        </div>
      )}

      {reminders.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-[4rem] border border-dashed border-plantin-sage/30">
          <i className="fas fa-calendar-check text-5xl text-stone-100 mb-6 block"></i>
          <p className="text-stone-400 font-medium font-serif italic">Your care schedule is clear.<br/>Add your first task above.</p>
        </div>
      ) : (
        <div className="grid gap-6">
          {reminders.map((r) => {
            const status = getDayStatus(r.nextDue);
            const icon = TASK_ICONS[r.task] || 'fa-bell';
            return (
              <div key={r.id} className="bg-white p-6 rounded-[3rem] shadow-sm border border-stone-100 flex items-center justify-between group hover:shadow-xl transition-all relative overflow-hidden">
                <div className="flex gap-5 items-center">
                  <div className={`w-14 h-14 rounded-2xl ${status.label === 'Overdue' ? 'bg-red-50 text-red-500' : 'bg-plantin-soft text-plantin-leaf'} flex items-center justify-center shadow-inner`}>
                    <i className={`fas ${icon} text-xl`}></i>
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-plantin-deep leading-tight">{r.task}</h3>
                    <p className="text-xs text-stone-400 font-medium mb-1">{r.plantName}</p>
                    <p className={`text-[10px] font-black uppercase tracking-widest ${status.color}`}>{status.label}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                   <button 
                    onClick={() => handleComplete(r.id)}
                    className="w-12 h-12 rounded-full bg-plantin-soft text-plantin-leaf hover:bg-plantin-leaf hover:text-white transition-all flex items-center justify-center shadow-sm"
                    title="Mark as done"
                  >
                    <i className="fas fa-check"></i>
                  </button>
                  <button 
                    onClick={() => handleDelete(r.id)}
                    className="w-12 h-12 rounded-full bg-red-50 text-red-300 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center shadow-sm"
                    title="Delete"
                  >
                    <i className="fas fa-trash-can"></i>
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
    <div className="min-h-screen bg-plantin-bone flex flex-col justify-center px-8 py-12 animate-in fade-in duration-700 relative overflow-hidden">
      <div className="absolute -top-20 -left-20 w-64 h-64 text-plantin-leaf/10 opacity-30 rotate-45 pointer-events-none">
        <i className="fas fa-leaf text-[15rem]"></i>
      </div>
      <div className="absolute -bottom-20 -right-20 w-64 h-64 text-plantin-leaf/10 opacity-30 -rotate-12 pointer-events-none">
        <i className="fas fa-leaf text-[15rem]"></i>
      </div>

      <div className="text-center mb-10 relative z-10">
        <div className="w-24 h-24 bg-plantin-leaf rounded-[2.8rem] flex items-center justify-center text-white shadow-2xl shadow-plantin-leaf/30 mx-auto mb-6 border-4 border-white">
          <i className="fas fa-leaf text-4xl"></i>
        </div>
        <h1 className="text-5xl font-serif font-bold text-plantin-deep tracking-tight mb-2">FloraGenius</h1>
        <p className="text-plantin-leaf/60 font-medium tracking-wide italic">"Nurture your curiosity."</p>
      </div>

      <div className="bg-white p-10 rounded-[3.5rem] shadow-xl border border-plantin-sage/20 relative z-10">
        <h2 className="text-2xl font-serif font-semibold text-plantin-deep mb-8 text-center">
          {isLogin ? "Welcome back, gardener" : "Start your digital garden"}
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-5">
          {!isLogin && (
            <div className="space-y-1">
              <label className="text-[10px] font-black text-plantin-leaf/50 uppercase ml-4 tracking-[0.2em]">Name</label>
              <input 
                type="text" 
                required 
                placeholder="Botanist Name"
                className="w-full bg-plantin-soft border-none rounded-2xl px-5 py-4 focus:ring-2 focus:ring-plantin-leaf transition-all outline-none text-plantin-deep placeholder:text-stone-300"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-plantin-leaf/50 uppercase ml-4 tracking-[0.2em]">Email</label>
            <input 
              type="email" 
              required 
              placeholder="seedling@nature.com"
              className="w-full bg-plantin-soft border-none rounded-2xl px-5 py-4 focus:ring-2 focus:ring-plantin-leaf transition-all outline-none text-plantin-deep placeholder:text-stone-300"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-plantin-leaf/50 uppercase ml-4 tracking-[0.2em]">Password</label>
            <input 
              type="password" 
              required 
              placeholder="••••••••"
              className="w-full bg-plantin-soft border-none rounded-2xl px-5 py-4 focus:ring-2 focus:ring-plantin-leaf transition-all outline-none text-plantin-deep placeholder:text-stone-300"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <p className="text-red-500 text-xs font-bold text-center mt-2">{error}</p>}

          <button 
            type="submit"
            className="w-full bg-plantin-leaf text-white py-5 rounded-[2rem] font-black shadow-lg shadow-plantin-leaf/20 hover:brightness-110 active:scale-[0.98] transition-all mt-4 text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-2"
          >
            {isLogin ? <><i className="fas fa-sign-in-alt"></i> Enter Garden</> : <><i className="fas fa-seedling"></i> Plant Seed</>}
          </button>
        </form>

        <button 
          onClick={() => setIsLogin(!isLogin)}
          className="w-full text-xs text-plantin-leaf font-black mt-8 text-center hover:opacity-70 transition-opacity uppercase tracking-widest"
        >
          {isLogin ? "Join the community →" : "Back to sign in"}
        </button>
      </div>
    </div>
  );
};

// --- Feature Components ---

const ProRequiredOverlay = ({ title, description }: { title?: string, description?: string }) => (
  <div className="bg-white rounded-[4rem] p-10 text-center space-y-6 shadow-xl border border-plantin-sage/20 relative overflow-hidden group">
    <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-plantin-leaf to-plantin-gold"></div>
    <div className="w-24 h-24 bg-plantin-soft rounded-full flex items-center justify-center text-plantin-gold mx-auto shadow-inner relative z-10">
      <i className="fas fa-crown text-4xl"></i>
    </div>
    <div className="space-y-2 relative z-10">
      <h3 className="text-3xl font-serif font-bold text-plantin-deep">{title || "Premium Feature"}</h3>
      <p className="text-stone-500 font-medium leading-relaxed italic">"{description || "This feature is reserved for our Pro members. Upgrade now to unlock the full botanical suite."}"</p>
    </div>
    <Link to="/profile" className="inline-block bg-plantin-leaf text-white px-12 py-5 rounded-[2.5rem] font-black shadow-xl shadow-plantin-leaf/20 hover:brightness-110 transition-all text-[10px] uppercase tracking-[0.2em] relative z-10">
      Upgrade to Pro
    </Link>
    <i className="fas fa-spa absolute -bottom-10 -right-10 text-plantin-leaf/5 text-[15rem] rotate-12 group-hover:rotate-45 transition-transform duration-1000"></i>
  </div>
);

const JournalScreen = ({ user }: { user: User }) => {
  const [journal, setJournal] = useState<JournalEntry[]>([]);

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('plant_journal') || '[]');
    setJournal(saved);
  }, []);

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom duration-700">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-4xl font-serif font-bold text-plantin-deep">My Garden</h2>
          <p className="text-plantin-leaf font-medium text-sm italic">A digital herbarium of your discoveries</p>
        </div>
        <div className="w-14 h-14 rounded-2xl bg-plantin-soft flex items-center justify-center text-plantin-leaf shadow-inner border border-plantin-sage/20">
          <i className="fas fa-book-open text-xl"></i>
        </div>
      </div>
      
      {journal.length === 0 ? (
        <div className="text-center py-32 bg-white rounded-[4rem] border border-dashed border-plantin-sage/30 relative overflow-hidden group">
           <i className="fas fa-leaf absolute -top-10 -right-10 text-plantin-leaf/5 text-9xl"></i>
          <div className="w-24 h-24 bg-plantin-bone rounded-full flex items-center justify-center text-stone-200 mx-auto mb-6 shadow-inner">
            <i className="fas fa-seedling text-4xl"></i>
          </div>
          <p className="text-stone-400 font-medium font-serif italic text-lg px-8">Your sanctuary is quiet.<br/>Identify a plant to add it to your collection.</p>
          <Link to="/identify" className="inline-block mt-8 bg-plantin-leaf text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:brightness-110 transition-all shadow-lg shadow-plantin-leaf/20">
            Identify First Plant
          </Link>
        </div>
      ) : (
        <div className="grid gap-6">
          {journal.map((item) => (
            <Link key={item.id} to={`/history/${item.id}`} className="bg-white p-5 rounded-[3rem] shadow-sm border border-stone-100 flex items-center gap-6 group hover:shadow-2xl transition-all hover:-translate-y-1 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 text-plantin-leaf/5">
                <i className="fas fa-leaf text-6xl"></i>
              </div>
              <div className="w-28 h-28 rounded-[2.5rem] overflow-hidden bg-plantin-soft shrink-0 border-4 border-white shadow-md relative z-10">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.plant.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-[2s]" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-plantin-leaf/30">
                    <i className="fas fa-image text-3xl"></i>
                  </div>
                )}
              </div>
              <div className="flex-1 pr-4 relative z-10">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-bold text-xl text-plantin-deep leading-tight group-hover:text-plantin-leaf transition-colors">{item.plant.name}</h3>
                  <span className="text-[8px] font-black text-stone-300 uppercase tracking-widest bg-stone-50 px-2 py-1 rounded-full">{new Date(item.timestamp).toLocaleDateString()}</span>
                </div>
                <p className="text-xs text-plantin-leaf font-serif italic mb-3 opacity-70">{item.plant.scientificName}</p>
                <div className="flex flex-wrap gap-2">
                   {item.plant.isToxic && <span className="px-2 py-0.5 bg-red-50 text-red-500 rounded-full text-[8px] font-black uppercase tracking-tighter border border-red-100"><i className="fas fa-skull mr-1"></i> Toxic</span>}
                   {item.plant.isWeed && <span className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded-full text-[8px] font-black uppercase tracking-tighter border border-amber-100"><i className="fas fa-bug mr-1"></i> Weed</span>}
                   <span className="px-2 py-0.5 bg-plantin-soft text-plantin-leaf rounded-full text-[8px] font-black uppercase tracking-tighter border border-plantin-sage/20">{item.plant.family}</span>
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
            setError("Geolocation permission denied. Please enable it to find shops.");
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
      setError("Failed to locate garden centers.");
    } finally {
      setLoading(false);
    }
  };

  if (!user.isPro) return <ProRequiredOverlay title="Garden Shops" description="Discover elite nurseries and botanical supplies in your immediate vicinity." />;

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom duration-700">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-4xl font-serif font-bold text-plantin-deep">Nurseries</h2>
          <p className="text-plantin-leaf font-medium text-sm italic">Locate fresh botanical supplies</p>
        </div>
        <div className="w-14 h-14 rounded-2xl bg-plantin-leaf text-white flex items-center justify-center shadow-lg shadow-plantin-leaf/20">
          <i className="fas fa-map-pin text-xl"></i>
        </div>
      </div>

      {loading ? (
        <div className="py-32 flex flex-col items-center justify-center gap-8">
          <div className="relative">
            <div className="w-20 h-20 border-4 border-plantin-sage border-t-plantin-leaf rounded-full animate-spin"></div>
            <i className="fas fa-location-dot absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-plantin-leaf animate-bounce"></i>
          </div>
          <p className="font-serif font-bold text-2xl text-plantin-deep italic opacity-60">Scanning the landscape...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 p-10 rounded-[3rem] text-red-600 text-sm font-medium border border-red-100 flex items-start gap-4 shadow-sm">
          <i className="fas fa-circle-exclamation mt-1 text-xl"></i>
          <p className="leading-relaxed">{error}</p>
        </div>
      ) : (
        <div className="grid gap-6">
          {centers.map((center, i) => (
            <a 
              key={i} 
              href={center.uri} 
              target="_blank" 
              rel="noopener noreferrer"
              className="bg-white p-6 rounded-[3rem] shadow-sm border border-stone-100 flex items-center justify-between hover:border-plantin-leaf transition-all hover:shadow-2xl group active:scale-[0.98]"
            >
              <div className="flex gap-6 items-center">
                <div className="w-16 h-16 bg-plantin-soft rounded-[1.8rem] flex items-center justify-center text-plantin-leaf shadow-inner group-hover:rotate-12 transition-transform">
                  <i className="fas fa-tree text-2xl"></i>
                </div>
                <div>
                  <h3 className="font-bold text-xl text-plantin-deep leading-tight mb-1">{center.title}</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-plantin-leaf font-black uppercase tracking-[0.2em] opacity-60">Garden Center</span>
                    <i className="fas fa-chevron-right text-[8px] text-stone-200"></i>
                  </div>
                </div>
              </div>
              <div className="w-12 h-12 rounded-full bg-plantin-soft text-plantin-leaf flex items-center justify-center group-hover:bg-plantin-leaf group-hover:text-white transition-colors">
                <i className="fas fa-directions"></i>
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

  // Pick stable random tips for this mount session
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
    <div className="space-y-10 animate-in fade-in duration-700">
      <div className="relative overflow-hidden rounded-[4rem] bg-plantin-deep text-white shadow-2xl group">
        <div className="relative h-80 w-full overflow-hidden">
          <img 
            src="https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&q=80&w=1200" 
            alt="Nature backdrop" 
            className="w-full h-full object-cover opacity-60 scale-105 group-hover:scale-110 transition-transform duration-[20s] ease-out"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-plantin-deep via-plantin-deep/20 to-transparent"></div>
          <div className="absolute top-8 right-8 bg-plantin-leaf/30 backdrop-blur-2xl px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border border-white/10 flex items-center gap-2 shadow-2xl">
            <i className={`fas fa-leaf ${coords ? 'text-emerald-400' : 'text-white'} animate-pulse`}></i>
            {coords ? 'Local Habitat Active' : 'Botanical Intelligence'}
          </div>
        </div>

        <div className="p-12 pt-0 relative z-10 -mt-20">
          <h1 className="text-6xl font-serif font-bold mb-4 tracking-tighter leading-[1]">{user.name.split(' ')[0]}<span className="text-plantin-sage">.</span></h1>
          <p className="text-plantin-sage font-medium text-xl italic opacity-90 leading-relaxed max-w-[80%]">Explore the secrets of the botanical world.</p>
          
          <div className="mt-12 flex gap-5">
            <Link to="/identify" className="flex-1 bg-white text-plantin-deep px-6 py-5 rounded-[2.2rem] font-black text-center shadow-2xl hover:bg-plantin-soft transition-all text-[11px] uppercase tracking-widest active:scale-95 flex items-center justify-center gap-3">
              <i className="fas fa-camera-retro text-base"></i> Identify
            </Link>
            <Link to="/diagnose" className="flex-1 bg-plantin-leaf text-white px-6 py-5 rounded-[2.2rem] font-black text-center shadow-2xl hover:brightness-110 transition-all text-[11px] uppercase tracking-widest active:scale-95 flex items-center justify-center gap-3">
              <i className="fas fa-stethoscope text-base"></i> Diagnose
              {!user.isPro && <i className="fas fa-lock text-[10px] opacity-60"></i>}
            </Link>
          </div>
        </div>
      </div>

      {user.isPro && coords && (
        <section className="bg-white p-10 rounded-[3.5rem] border border-plantin-sage/20 shadow-sm relative overflow-hidden group">
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-plantin-soft rounded-full blur-3xl opacity-30 group-hover:scale-125 transition-transform duration-[3s]"></div>
          <div className="flex justify-between items-center mb-8 relative z-10">
            <div className="flex items-center gap-3">
               <div className="w-12 h-12 bg-plantin-soft rounded-2xl flex items-center justify-center text-plantin-leaf">
                  <i className="fas fa-mountain-sun text-xl"></i>
               </div>
               <h3 className="font-serif font-bold text-2xl text-plantin-deep">Local Eco-Scan</h3>
            </div>
            <button 
              onClick={discoverFlora}
              disabled={loadingFlora}
              className="w-10 h-10 bg-plantin-soft rounded-full flex items-center justify-center text-plantin-leaf hover:bg-plantin-leaf hover:text-white transition-all disabled:opacity-50"
            >
              <i className={`fas fa-arrows-rotate ${loadingFlora ? 'animate-spin' : ''}`}></i>
            </button>
          </div>
          
          {localFlora ? (
            <div className="animate-in fade-in slide-in-from-top-6 duration-700 relative z-10">
              <p className="text-base text-plantin-deep font-medium leading-[1.8] italic mb-8 border-l-4 border-plantin-sage pl-6">"{localFlora.text}"</p>
              <div className="flex flex-wrap gap-3">
                {localFlora.sources.map((s, i) => (
                  <a key={i} href={s.uri} target="_blank" className="text-[10px] bg-plantin-soft text-plantin-leaf px-5 py-2 rounded-full font-black uppercase tracking-widest border border-plantin-sage/20 hover:bg-white hover:shadow-md transition-all flex items-center gap-2">
                    <i className="fas fa-location-arrow text-[8px]"></i> {s.title}
                  </a>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 relative z-10 bg-plantin-bone/50 rounded-[2.5rem] border border-stone-50">
              <p className="text-sm mb-8 font-serif italic text-stone-400 max-w-[80%] mx-auto">Discover which plant species are thriving in your current climate and ecosystem right now.</p>
              <button onClick={discoverFlora} className="bg-plantin-deep text-white px-12 py-4 rounded-[1.8rem] text-[10px] font-black uppercase tracking-[0.3em] hover:bg-plantin-leaf shadow-2xl shadow-plantin-deep/20 transition-all">Start Ecology Scan</button>
            </div>
          )}
        </section>
      )}

      <section>
        <div className="flex justify-between items-end mb-8">
          <h2 className="text-2xl font-serif font-bold text-plantin-deep">Botanist Tools</h2>
          <Link to="/profile" className="text-[10px] font-black text-plantin-leaf uppercase tracking-widest hover:opacity-70 flex items-center gap-2">
            {user.isPro ? <><i className="fas fa-gem"></i> Pro Tier</> : "Explore Pro Features"}
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-6">
          {[
            { icon: 'fa-user-md', label: 'Doctor', color: 'bg-white text-plantin-leaf', path: '/diagnose', pro: true, desc: 'Heal infections' },
            { icon: 'fa-seedling', label: 'My Garden', color: 'bg-white text-plantin-leaf', path: '/history', desc: 'Saved collection' },
            { icon: 'fa-calendar-check', label: 'Care Schedule', color: 'bg-white text-plantin-leaf', path: '/reminders', pro: true, desc: 'Water & prune' },
            { icon: 'fa-store-alt', label: 'Nurseries', color: 'bg-white text-plantin-leaf', path: '/shops', pro: true, desc: 'Local supplies' },
          ].map((feat, i) => (
            <Link 
              key={i} 
              to={feat.path}
              className={`p-8 rounded-[3.5rem] border border-stone-50 ${feat.color} flex flex-col items-center text-center gap-4 shadow-sm hover:shadow-2xl transition-all group active:scale-[0.96]`}
            >
              <div className="w-16 h-16 rounded-[2rem] bg-plantin-soft flex items-center justify-center text-2xl shadow-inner relative group-hover:scale-110 transition-transform duration-500">
                <i className={`fas ${feat.icon}`}></i>
                {feat.pro && !user.isPro && (
                  <div className="absolute -top-1 -right-1 w-7 h-7 bg-plantin-gold rounded-full flex items-center justify-center text-[10px] text-white border-4 border-white shadow-xl">
                    <i className="fas fa-crown"></i>
                  </div>
                )}
              </div>
              <div>
                <span className="text-base font-bold text-plantin-deep block leading-tight">{feat.label}</span>
                <span className="text-[10px] font-medium text-stone-300 block mt-1 tracking-tight">{feat.desc}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="bg-plantin-deep rounded-[4rem] p-12 flex flex-col items-center text-center gap-8 border border-white/5 relative overflow-hidden group shadow-2xl">
        <div className="absolute -left-20 -bottom-20 w-64 h-64 bg-plantin-leaf/20 rounded-full blur-3xl group-hover:scale-125 transition-transform duration-[5s]"></div>
        <div className="w-20 h-20 rounded-[2rem] bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center text-white shadow-2xl relative z-10">
          <i className="fas fa-spa text-3xl"></i>
        </div>
        <div className="relative z-10">
          <p className="text-[11px] font-black text-plantin-sage/40 uppercase tracking-[0.4em] mb-4">Cultivation Strategy</p>
          <p className="text-2xl font-serif font-medium text-white leading-relaxed italic">"{botanicalTip}"</p>
          <div className="flex items-center justify-center gap-4 mt-8">
            <div className="h-px w-8 bg-white/20"></div>
            <p className="text-[10px] font-black text-plantin-sage uppercase tracking-[0.3em]">Master Gardener Tip</p>
            <div className="h-px w-8 bg-white/20"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

const IdentifyScreen = ({ user, coords }: { user: User, coords: GeolocationCoordinates | null }) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{data: PlantIdentification, sources: GroundingSource[], referenceImage?: string | null} | null>(null);

  const handleIdentify = async (base64: string) => {
    setLoading(true);
    try {
      const res = await identifyPlant(base64, coords?.latitude, coords?.longitude);
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
        console.warn("Storage full, trimming journal further...");
        localStorage.setItem('plant_journal', JSON.stringify(updatedJournal.slice(0, 10)));
      }
      
      setResult({ ...res, referenceImage });
    } catch (error) {
      console.error(error);
      alert("Botanical scan failed. Please ensure the plant is well-lit and clear.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-40 text-plantin-deep gap-10">
      <div className="relative">
        <div className="w-32 h-32 border-[6px] border-plantin-sage border-t-plantin-leaf rounded-full animate-spin shadow-[0_0_50px_rgba(45,106,79,0.2)]"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-lg">
           <i className="fas fa-leaf text-plantin-leaf text-3xl animate-pulse"></i>
        </div>
      </div>
      <div className="text-center px-10">
        <p className="font-serif font-bold text-4xl text-plantin-deep mb-3 tracking-tighter">Analyzing Flora</p>
        <div className="flex flex-col gap-2">
          <p className="text-xs text-stone-400 font-medium uppercase tracking-[0.2em]">Consulting Global Botanical Databases</p>
          <div className="flex justify-center gap-1">
             <div className="w-1.5 h-1.5 rounded-full bg-plantin-leaf animate-bounce delay-75"></div>
             <div className="w-1.5 h-1.5 rounded-full bg-plantin-leaf animate-bounce delay-150"></div>
             <div className="w-1.5 h-1.5 rounded-full bg-plantin-leaf animate-bounce delay-300"></div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-10">
      {!result ? (
        <div className="space-y-10">
          <div className="flex justify-between items-center">
             <h2 className="text-5xl font-serif font-bold text-plantin-deep">Identify</h2>
             <div className="w-12 h-12 rounded-2xl bg-plantin-soft flex items-center justify-center text-plantin-leaf">
                <i className="fas fa-magnifying-glass-leaf text-xl"></i>
             </div>
          </div>
          <CameraCapture label="Snap Botanical Photo" onCapture={handleIdentify} />
          <div className="bg-plantin-soft/50 p-8 rounded-[3rem] border border-plantin-sage/20">
             <p className="text-center text-base font-serif italic text-plantin-deep/60 leading-relaxed">Capture any leaf, flower, or bark to unveil its species, origins, and specialized care requirements instantly.</p>
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
      alert("Diagnostic failure. Ensure the plant's health issue is in focus and well-lit.");
    } finally {
      setLoading(false);
    }
  };

  if (!user.isPro) return <ProRequiredOverlay title="Botanical Physician" description="Access advanced health diagnostics, pest identification, and expert treatment plans for your stressed plants." />;

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-40 text-plantin-deep gap-10">
      <div className="relative">
        <div className="w-32 h-32 border-[6px] border-plantin-sage border-t-amber-500 rounded-full animate-spin shadow-[0_0_50px_rgba(212,175,55,0.2)]"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-lg">
           <i className="fas fa-stethoscope text-amber-500 text-3xl animate-pulse"></i>
        </div>
      </div>
      <div className="text-center px-10">
        <p className="font-serif font-bold text-4xl text-plantin-deep mb-3 tracking-tighter">Clinical Analysis</p>
        <div className="flex flex-col gap-2">
          <p className="text-xs text-stone-400 font-medium uppercase tracking-[0.2em]">Evaluating Visual Pathology Markers</p>
          <div className="flex justify-center gap-1">
             <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-bounce delay-75"></div>
             <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-bounce delay-150"></div>
             <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-bounce delay-300"></div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-10">
      {!result ? (
        <div className="space-y-10">
           <div className="flex justify-between items-center">
             <h2 className="text-5xl font-serif font-bold text-plantin-deep">Diagnose</h2>
             <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-500">
                <i className="fas fa-staff-snake text-xl"></i>
             </div>
          </div>
          <CameraCapture label="Scan Symptomatic Plant" onCapture={handleDiagnose} />
          <div className="bg-amber-50/50 p-8 rounded-[3rem] border border-amber-100/50">
             <p className="text-center text-base font-serif italic text-amber-900/60 leading-relaxed">Instantly identify wilting, spotting, or parasitic infestations to receive immediate botanical treatment protocols.</p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-[4.5rem] p-12 shadow-2xl border-l-[16px] border-l-amber-500 animate-in zoom-in duration-700 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-12 opacity-5 text-amber-600 rotate-12 group-hover:rotate-45 transition-transform duration-1000">
            <i className="fas fa-microscope text-[15rem]"></i>
          </div>
          <div className="mb-12 relative z-10">
            <span className="text-[11px] bg-amber-50 text-amber-700 px-5 py-2 rounded-full font-black uppercase tracking-[0.3em] mb-6 inline-block shadow-sm">Diagnostic Conclusion</span>
            <h2 className="text-6xl font-serif font-bold text-plantin-deep mb-2 leading-tight tracking-tighter">{result.data.plantName}</h2>
            <p className="text-3xl font-serif italic text-amber-600 font-semibold tracking-tight">{result.data.issue}</p>
          </div>
          
          <div className="space-y-12 relative z-10">
            <div className="p-12 bg-plantin-soft/40 rounded-[4rem] shadow-inner border border-plantin-sage/10 relative overflow-hidden group">
              <h4 className="text-[11px] font-black uppercase text-plantin-leaf mb-8 tracking-[0.4em] text-center underline underline-offset-[12px] decoration-plantin-leaf/30">Clinical Treatment Plan</h4>
              <ul className="grid gap-6">
                {result.data.recommendations.map((r, i) => (
                  <li key={i} className="text-sm font-medium text-plantin-deep flex gap-6 bg-white/95 p-7 rounded-[2.2rem] shadow-sm border border-transparent hover:border-plantin-sage/20 transition-all group/item">
                    <div className="w-8 h-8 rounded-2xl bg-plantin-leaf text-white flex items-center justify-center shrink-0 text-xs mt-0.5 shadow-lg shadow-plantin-leaf/20 group-hover/item:rotate-12 transition-transform">
                      <i className="fas fa-hand-holding-medical"></i>
                    </div>
                    <p className="flex-1 leading-relaxed italic">"{r}"</p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid grid-cols-2 gap-6">
               <div className="p-8 bg-plantin-bone rounded-[2.5rem] border border-stone-50 text-center">
                  <p className="text-[10px] font-black text-stone-300 uppercase tracking-[0.2em] mb-3">Accuracy Index</p>
                  <p className="text-3xl font-serif font-bold text-plantin-leaf tracking-tighter">{(result.data.confidence * 100).toFixed(0)}%</p>
               </div>
               <div className="p-8 bg-plantin-bone rounded-[2.5rem] border border-stone-50 text-center">
                  <p className="text-[10px] font-black text-stone-300 uppercase tracking-[0.2em] mb-3">Status</p>
                  <p className="text-base font-serif font-bold text-plantin-deep italic leading-tight">{result.data.prognosis}</p>
               </div>
            </div>

            {result.sources.length > 0 && (
              <div className="space-y-6 pt-6">
                <h4 className="text-[10px] font-black text-stone-300 uppercase tracking-[0.4em] text-center">Diagnostic References</h4>
                <div className="flex flex-wrap justify-center gap-4">
                  {result.sources.map((source, i) => (
                    <a 
                      key={i} 
                      href={source.uri} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-[10px] bg-amber-50 text-amber-700 px-6 py-3 rounded-full border border-amber-100 hover:bg-white transition-all flex items-center gap-3 font-black uppercase tracking-widest shadow-sm"
                    >
                      <i className="fas fa-file-medical text-[10px] opacity-40"></i> {source.title}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button onClick={() => setResult(null)} className="w-full bg-plantin-deep text-white py-8 rounded-[3rem] font-black shadow-2xl hover:bg-plantin-leaf transition-all uppercase tracking-[0.3em] text-[11px] mt-16 active:scale-95 flex items-center justify-center gap-3">
             <i className="fas fa-rotate"></i> Initiate New Scan
          </button>
        </div>
      )}
    </div>
  );
};

// --- Profile Screen Component ---

const ProfileScreen = ({ user, onLogout, onUpgrade }: { user: User, onLogout: () => void, onUpgrade: () => void }) => {
  const [upgrading, setUpgrading] = useState(false);

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

  return (
    <div className="space-y-12 animate-in slide-in-from-bottom duration-700">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-5xl font-serif font-bold text-plantin-deep">Profile</h2>
          <p className="text-plantin-leaf font-medium text-sm italic">Cultivating expertise since {new Date(user.joinedDate).toLocaleDateString()}</p>
        </div>
        <div className="w-14 h-14 rounded-2xl bg-plantin-soft flex items-center justify-center text-plantin-leaf border border-plantin-sage/20">
           <i className="fas fa-id-badge text-xl"></i>
        </div>
      </div>

      <div className="bg-white p-12 rounded-[4.5rem] shadow-xl border border-stone-50 space-y-12 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-plantin-soft rounded-full -mr-32 -mt-32 blur-3xl opacity-60 group-hover:scale-110 transition-transform duration-[4s]"></div>
        <div className="flex flex-col items-center gap-8 relative z-10">
          <div className="w-40 h-40 rounded-[4rem] bg-plantin-leaf flex items-center justify-center text-white text-6xl font-serif font-black shadow-2xl border-[12px] border-white group-hover:rotate-6 transition-transform">
            {user.name[0]}
          </div>
          <div className="text-center">
            <h3 className="text-4xl font-serif font-bold text-plantin-deep mb-2 tracking-tight">{user.name}</h3>
            <p className="text-stone-400 font-medium tracking-[0.2em] uppercase text-xs">{user.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 relative z-10">
          <div className="p-10 rounded-[3rem] bg-plantin-soft/30 border border-plantin-sage/10 text-center group/item hover:bg-white hover:shadow-xl transition-all">
            <p className="text-[11px] font-black uppercase text-stone-300 mb-3 tracking-[0.3em]">Tier</p>
            <div className="flex items-center justify-center gap-3">
              <span className={`text-xl font-black ${user.isPro ? 'text-plantin-leaf' : 'text-stone-400'} uppercase tracking-[0.1em]`}>
                {user.isPro ? 'Pro' : 'Free'}
              </span>
              {user.isPro && <i className="fas fa-gem text-plantin-gold animate-pulse"></i>}
            </div>
          </div>
          <div className="p-10 rounded-[3rem] bg-plantin-soft/30 border border-plantin-sage/10 text-center group/item hover:bg-white hover:shadow-xl transition-all">
            <p className="text-[11px] font-black uppercase text-stone-300 mb-3 tracking-[0.3em]">Status</p>
            <div className="flex items-center justify-center gap-2">
               <i className="fas fa-shield-halved text-plantin-leaf text-xl"></i>
               <span className="text-xs font-black text-plantin-deep uppercase tracking-widest">Active</span>
            </div>
          </div>
        </div>

        {!user.isPro && (
          <div className="bg-plantin-deep p-12 rounded-[3.5rem] text-white shadow-2xl relative overflow-hidden group/pro">
            <div className="relative z-10">
              <h4 className="text-3xl font-serif font-bold mb-4 tracking-tight">Elite Botanical Suite</h4>
              <p className="text-base text-plantin-sage font-medium mb-10 opacity-80 leading-relaxed italic">
                Unlock specialized diagnostics, advanced ecology maps, and unlimited collection space for your digital herbarium.
              </p>
              <button 
                onClick={handleUpgrade}
                disabled={upgrading}
                className="w-full bg-white text-plantin-deep py-6 rounded-[2rem] font-black text-xs uppercase tracking-[0.3em] shadow-2xl hover:bg-plantin-soft active:scale-[0.98] transition-all"
              >
                {upgrading ? 'Finalizing...' : 'Get Lifetime Access - $9.99'}
              </button>
            </div>
            <i className="fas fa-crown absolute -bottom-16 -right-16 text-white/5 text-[20rem] rotate-12 group-hover/pro:rotate-45 transition-transform duration-1000"></i>
          </div>
        )}

        <button 
          onClick={onLogout}
          className="w-full text-stone-300 text-[11px] font-black uppercase tracking-[0.4em] hover:text-red-500 transition-colors pt-10 border-t border-stone-50"
        >
          Sign Out of Sanctuary
        </button>
      </div>
    </div>
  );
};

const Nav = ({ user }: { user: User }) => {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path || (path === '/history' && location.pathname.startsWith('/history/'));

  return (
    <nav className="fixed bottom-10 left-1/2 -translate-x-1/2 w-[90%] max-sm glass rounded-[4rem] px-12 py-7 flex justify-between items-center z-50 shadow-[0_30px_60px_-15px_rgba(30,58,52,0.3)] border border-white/60">
      <Link to="/" className={`flex flex-col items-center transition-all duration-300 ${isActive('/') && !location.pathname.startsWith('/history') && !location.pathname.startsWith('/reminders') ? 'text-plantin-leaf scale-150 drop-shadow-[0_0_8px_rgba(45,106,79,0.3)]' : 'text-stone-300 hover:text-plantin-leaf/60'}`}>
        <i className="fas fa-seedling text-2xl"></i>
      </Link>
      <Link to="/reminders" className={`relative flex flex-col items-center transition-all duration-300 ${isActive('/reminders') ? 'text-plantin-leaf scale-150 drop-shadow-[0_0_8px_rgba(45,106,79,0.3)]' : 'text-stone-300 hover:text-plantin-leaf/60'}`}>
        <i className="fas fa-calendar-check text-2xl"></i>
        {!user.isPro && <div className="absolute -top-1 -right-1 w-4 h-4 bg-plantin-gold rounded-full border-2 border-white flex items-center justify-center text-[6px] shadow-md text-white"><i className="fas fa-crown"></i></div>}
      </Link>
      <div className="relative">
        <Link to="/diagnose" className="w-20 h-20 bg-plantin-leaf rounded-full flex items-center justify-center text-white shadow-2xl shadow-plantin-leaf/40 -mt-24 border-[6px] border-plantin-bone active:scale-90 transition-transform hover:brightness-110">
          <i className="fas fa-stethoscope text-2xl"></i>
          {!user.isPro && <div className="absolute -top-1 -right-1 w-8 h-8 bg-plantin-gold rounded-full border-4 border-plantin-bone flex items-center justify-center text-[10px] shadow-xl"><i className="fas fa-crown"></i></div>}
        </Link>
      </div>
      <Link to="/history" className={`flex flex-col items-center transition-all duration-300 ${isActive('/history') ? 'text-plantin-leaf scale-150 drop-shadow-[0_0_8px_rgba(45,106,79,0.3)]' : 'text-stone-300 hover:text-plantin-leaf/60'}`}>
        <i className="fas fa-book-leaf text-2xl"></i>
      </Link>
      <Link to="/profile" className={`flex flex-col items-center transition-all duration-300 ${isActive('/profile') ? 'text-plantin-leaf scale-150 drop-shadow-[0_0_8px_rgba(45,106,79,0.3)]' : 'text-stone-300 hover:text-plantin-leaf/60'}`}>
        <i className="fas fa-user-circle text-2xl"></i>
      </Link>
    </nav>
  );
};

// --- Push-style Popup Manager ---

const InAppNotification = ({ message, onClose }: { message: string, onClose: () => void }) => (
  <div className="fixed top-10 left-1/2 -translate-x-1/2 w-[85%] max-w-sm bg-plantin-deep text-white p-6 rounded-[2.5rem] shadow-2xl z-[100] animate-in slide-in-from-top duration-500 flex items-center gap-5 border border-white/10">
    <div className="w-12 h-12 rounded-full bg-plantin-leaf flex items-center justify-center shrink-0">
      <i className="fas fa-bell animate-swing"></i>
    </div>
    <div className="flex-1">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-plantin-sage mb-1">Care Reminder</p>
      <p className="text-sm font-medium leading-snug">{message}</p>
    </div>
    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center opacity-40 hover:opacity-100">
      <i className="fas fa-xmark"></i>
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
      const now = new Date();
      const due = reminders.find(r => new Date(r.nextDue) <= now);
      if (due) {
        setActivePopup(`${due.plantName} needs ${due.task.toLowerCase()}!`);
      }
    };

    const interval = setInterval(checkSchedule, 30000); // Check every 30 seconds
    checkSchedule(); // Initial check
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
    <div className="max-w-md mx-auto min-h-screen pb-48 pt-16 px-8 font-sans bg-plantin-bone selection:bg-plantin-sage selection:text-plantin-deep scroll-smooth">
      {activePopup && <InAppNotification message={activePopup} onClose={() => setActivePopup(null)} />}
      
      <header className="flex justify-between items-center mb-16 animate-in slide-in-from-top-10 duration-1000">
        <Link to="/" className="flex items-center gap-5 group">
          <div className="w-16 h-16 bg-plantin-leaf rounded-[2rem] flex items-center justify-center text-white shadow-2xl shadow-plantin-leaf/30 group-hover:rotate-12 transition-all border-4 border-white">
            <i className="fas fa-leaf text-3xl"></i>
          </div>
          <div>
            <span className="text-3xl font-serif font-bold text-plantin-deep tracking-tighter block leading-none group-hover:text-plantin-leaf transition-colors">FloraGenius</span>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] font-black text-plantin-leaf/40 uppercase tracking-[0.3em] block">AI Botanical Analyst</span>
              {coords && <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(52,211,153,0.8)]"></div>}
            </div>
          </div>
        </Link>
        <Link to="/profile" className="w-16 h-16 rounded-[2rem] bg-white shadow-sm border border-stone-100 flex items-center justify-center text-stone-300 hover:text-plantin-leaf transition-all hover:shadow-2xl group active:scale-95">
          <div className="w-full h-full rounded-[2rem] bg-plantin-soft flex items-center justify-center text-plantin-leaf font-black text-xl font-serif border-4 border-white group-hover:scale-105 transition-transform">
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
