import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, 
  Users, 
  Plus, 
  TrendingUp, 
  User, 
  Camera, 
  Upload, 
  Check, 
  Lock, 
  Send, 
  Trash2, 
  UserPlus, 
  AlertCircle, 
  RotateCcw,
  Key
} from 'lucide-react';
import { supabase, isSupabaseConfigured, runStoragePurge } from './utils/supabase';
import { compressImage } from './utils/compressor';

// --- MOCK STORAGE FALLBACK FOR DEMO MODE ---
// Used when VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not yet configured.
const INITIAL_MOCK_PROFILE = {
  id: 'mock-user-id-1',
  display_name: 'Sarah (Demo)',
  family_id: 'mock-family-id',
  avatar_url: '',
  daily_calorie_goal: 1850,
  daily_protein_goal: 150,
  daily_carb_goal: 300,
  daily_fat_goal: 80,
  share_with_family: true
};

const INITIAL_MOCK_FAMILY = {
  id: 'mock-family-id',
  family_name: 'Green Family',
  invite_code: 'FAM-582'
};

const INITIAL_MOCK_LOGS = [
  {
    id: 'l1',
    user_id: 'mock-user-id-1',
    meal_name: 'Chicken Breast & Brown Rice',
    calories: 520,
    protein_g: 45,
    carbs_g: 60,
    fat_g: 10,
    thumbnail_path: null,
    ai_confidence: 0.95,
    is_edited: false,
    created_at: new Date(Date.now() - 3600000 * 3).toISOString() // 3 hours ago
  },
  {
    id: 'l2',
    user_id: 'mock-user-id-1',
    meal_name: 'Avocado Toast & Egg',
    calories: 380,
    protein_g: 15,
    carbs_g: 35,
    fat_g: 22,
    thumbnail_path: null,
    ai_confidence: 0.92,
    is_edited: true,
    created_at: new Date(Date.now() - 3600000 * 8).toISOString() // 8 hours ago
  },
  {
    id: 'l3',
    user_id: 'mock-user-id-dad',
    meal_name: 'Whey Protein Shake',
    calories: 220,
    protein_g: 30,
    carbs_g: 10,
    fat_g: 3,
    thumbnail_path: null,
    ai_confidence: 0.98,
    is_edited: false,
    created_at: new Date(Date.now() - 3600000 * 2).toISOString()
  }
];

const MOCK_PROFILES = [
  INITIAL_MOCK_PROFILE,
  {
    id: 'mock-user-id-dad',
    display_name: 'Dad',
    family_id: 'mock-family-id',
    avatar_url: '',
    daily_calorie_goal: 2200,
    daily_protein_goal: 180,
    daily_carb_goal: 220,
    daily_fat_goal: 70,
    share_with_family: true
  },
  {
    id: 'mock-user-id-liam',
    display_name: 'Liam',
    family_id: 'mock-family-id',
    avatar_url: '',
    daily_calorie_goal: 1600,
    daily_protein_goal: 100,
    daily_carb_goal: 200,
    daily_fat_goal: 50,
    share_with_family: false // Hidden by default (Apple Health binary sharing)
  }
];

export default function App() {
  const [useDemo, setUseDemo] = useState(!isSupabaseConfigured());
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [family, setFamily] = useState(null);
  const [logs, setLogs] = useState([]);
  const [familyProfiles, setFamilyProfiles] = useState([]);
  const [currentTab, setCurrentTab] = useState('today'); // 'today', 'family', 'log', 'trends', 'profile'
  
  // Auth state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [newFamilyName, setNewFamilyName] = useState('');
  const [age, setAge] = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');

  // Log Form state
  const [logType, setLogType] = useState('text'); // 'text', 'camera', 'upload'
  const [textDescription, setTextDescription] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [compressedBlob, setCompressedBlob] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null); // Result from Groq Worker
  const [workerUrl, setWorkerUrl] = useState(import.meta.env.VITE_WORKER_URL || 'http://localhost:8787/analyze');

  // Review & Tweak state
  const [editMealName, setEditMealName] = useState('');
  const [editCalories, setEditCalories] = useState(0);
  const [editProtein, setEditProtein] = useState(0);
  const [editCarbs, setEditCarbs] = useState(0);
  const [editFat, setEditFat] = useState(0);

  // Trends Tab state
  const [selectedMacroType, setSelectedMacroType] = useState('protein'); // 'calories', 'protein', 'carbs', 'fat'
  const [selectedFamilyMemberId, setSelectedFamilyMemberId] = useState(null);

  // Camera stream ref
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);

  // ----------------------------------------------------
  // DATA LOAD & LIFECYCLE MANAGEMENT
  // ----------------------------------------------------
  useEffect(() => {
    if (useDemo) {
      // Setup demo environment
      setUser({ id: 'mock-user-id-1', email: 'demo@family.com' });
      setProfile(INITIAL_MOCK_PROFILE);
      setFamily(INITIAL_MOCK_FAMILY);
      setFamilyProfiles(MOCK_PROFILES);
      
      // Load logs from localStorage or defaults
      const localLogs = localStorage.getItem('demo_macro_logs');
      if (localLogs) {
        setLogs(JSON.parse(localLogs));
      } else {
        setLogs(INITIAL_MOCK_LOGS);
        localStorage.setItem('demo_macro_logs', JSON.stringify(INITIAL_MOCK_LOGS));
      }
    } else {
      // Connect to real Supabase auth state change
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          setUser(session.user);
          loadUserData(session.user.id);
        }
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          setUser(session.user);
          loadUserData(session.user.id);
        } else {
          setUser(null);
          setProfile(null);
          setFamily(null);
          setLogs([]);
          setFamilyProfiles([]);
        }
      });

      return () => subscription.unsubscribe();
    }
  }, [useDemo]);

  // Load cloud data for active user
  const loadUserData = async (userId) => {
    try {
      // 1. Fetch Profile
      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (profErr) throw profErr;
      setProfile(prof);

      // Trigger global 90-day storage retention purge
      runStoragePurge(userId);

      // 2. Fetch Family Group if bound
      if (prof.family_id) {
        const { data: fam, error: famErr } = await supabase
          .from('families')
          .select('*')
          .eq('id', prof.family_id)
          .single();
        if (famErr) throw famErr;
        setFamily(fam);

        // Fetch other family profiles
        const { data: profilesList, error: listErr } = await supabase
          .from('profiles')
          .select('*')
          .eq('family_id', prof.family_id);
        if (listErr) throw listErr;
        setFamilyProfiles(profilesList);
      }

      // 3. Fetch user's own logs
      const { data: userLogs, error: logsErr } = await supabase
        .from('macro_logs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (logsErr) throw logsErr;
      setLogs(userLogs);

    } catch (err) {
      console.error("Error loading user data:", err.message);
    }
  };

  // Fetch shared family logs dynamically via the DB view
  const getFamilySharedLogs = async () => {
    if (useDemo) {
      // Filter out profiles with share_with_family = false
      const sharedUserIds = familyProfiles
        .filter(p => p.share_with_family || p.id === profile.id)
        .map(p => p.id);
      return logs.filter(l => sharedUserIds.includes(l.user_id));
    }

    try {
      const { data: sharedLogs, error } = await supabase
        .from('shared_macro_logs')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return sharedLogs;
    } catch (err) {
      console.error("Failed to query shared macro view:", err);
      return [];
    }
  };

  const [sharedFeed, setSharedFeed] = useState([]);
  useEffect(() => {
    if (user && (currentTab === 'family' || currentTab === 'today')) {
      getFamilySharedLogs().then(data => setSharedFeed(data));
    }
  }, [logs, currentTab, user, familyProfiles]);

  // ----------------------------------------------------
  // AUTHENTICATION LOGIC
  // ----------------------------------------------------
  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    if (useDemo) return;

    try {
      if (isRegistering) {
        // Register account
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: displayName || email.split('@')[0],
              age: age ? Number(age) : null,
              weight: weight ? Number(weight) : null,
              height: height ? Number(height) : null
            }
          }
        });
        if (error) throw error;
        
        if (data.user) {
          // Initialize empty profile (User must join or create family next)
          try {
            const { error: profileErr } = await supabase
              .from('profiles')
              .upsert({
                id: data.user.id,
                display_name: displayName || email.split('@')[0],
                daily_calorie_goal: 2000,
                daily_protein_goal: 150,
                daily_carb_goal: 200,
                daily_fat_goal: 70,
                share_with_family: true,
                age: age ? Number(age) : null,
                weight: weight ? Number(weight) : null,
                height: height ? Number(height) : null
              });
            // If email verification is on, this manual insert will fail due to lack of active auth token.
            // The backend database trigger handles creation in that case, so we safely catch RLS errors.
            if (profileErr && !profileErr.message.includes('row-level security')) {
              throw profileErr;
            }
          } catch (err) {
            console.warn("Profile creation handled via database trigger:", err);
          }
        }
      } else {
        // Login account
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const handleSignOut = async () => {
    if (useDemo) {
      setUser(null);
      setProfile(null);
      setFamily(null);
    } else {
      await supabase.auth.signOut();
    }
  };

  // ----------------------------------------------------
  // FAMILY CREATION & JOIN PROCEDURES
  // ----------------------------------------------------
  const handleCreateFamily = async () => {
    if (!newFamilyName) return;
    
    if (useDemo) {
      const newFamId = Math.random().toString(36).substr(2, 9);
      const newCode = 'FAM-' + Math.floor(100 + Math.random() * 900);
      const newFam = { id: newFamId, family_name: newFamilyName, invite_code: newCode };
      
      setFamily(newFam);
      setProfile(prev => ({ ...prev, family_id: newFamId }));
      setFamilyProfiles([ { ...profile, family_id: newFamId } ]);
      return;
    }

    try {
      const inviteCodeGenerated = 'FAM-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      const { data: newFam, error: famErr } = await supabase
        .from('families')
        .insert({ family_name: newFamilyName, invite_code: inviteCodeGenerated })
        .select()
        .single();
      
      if (famErr) throw famErr;

      // Update profile
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ family_id: newFam.id })
        .eq('id', user.id);
      
      if (profileErr) throw profileErr;
      loadUserData(user.id);
    } catch (err) {
      alert("Family creation failed: " + err.message);
    }
  };

  const handleJoinFamily = async () => {
    if (!inviteCode) return;

    if (useDemo) {
      if (inviteCode === INITIAL_MOCK_FAMILY.invite_code) {
        setFamily(INITIAL_MOCK_FAMILY);
        setProfile(prev => ({ ...prev, family_id: INITIAL_MOCK_FAMILY.id }));
        setFamilyProfiles(MOCK_PROFILES);
      } else {
        alert("Invite code not found in demo environment.");
      }
      return;
    }

    try {
      const { data: fam, error: famErr } = await supabase
        .from('families')
        .select('*')
        .eq('invite_code', inviteCode.trim())
        .single();
      
      if (famErr || !fam) {
        alert("Invalid invite code. Family group not found.");
        return;
      }

      // Update profile to belong to this family group
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ family_id: fam.id })
        .eq('id', user.id);
      
      if (profileErr) throw profileErr;
      loadUserData(user.id);
    } catch (err) {
      alert("Join failed: " + err.message);
    }
  };

  // ----------------------------------------------------
  // PROFILE / PLAN SETTINGS CONTROLS
  // ----------------------------------------------------
  const handleUpdateProfileSettings = async (updates) => {
    const updatedProfile = { ...profile, ...updates };
    setProfile(updatedProfile);

    if (useDemo) {
      // Sync mock profiles list
      setFamilyProfiles(prev => prev.map(p => p.id === profile.id ? updatedProfile : p));
      return;
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);
      if (error) throw error;
    } catch (err) {
      console.error("Update profile failed:", err);
    }
  };

  // ----------------------------------------------------
  // CLIENT CAMERA MEDIA STREAM IMPLEMENTATION
  // ----------------------------------------------------
  const startCamera = async () => {
    setCameraActive(true);
    setLogType('camera');
    setSelectedImage(null);
    setPreviewUrl(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: 400, height: 400 },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera access failed:", err);
      alert("Could not access camera. Please upload an image instead.");
      setLogType('upload');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const capturePhoto = async () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 400;
    canvas.height = videoRef.current.videoHeight || 400;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    
    // Stop camera track stream
    stopCamera();

    canvas.toBlob(async (blob) => {
      if (blob) {
        // Compress image using standard loop rules
        const compressed = await compressImage(blob);
        setCompressedBlob(compressed.blob);
        setPreviewUrl(compressed.base64);
        setLogType('upload'); // Switch to preview view
      }
    }, 'image/jpeg');
  };

  const handleImageFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Show instant temporary preview
    const tempUrl = URL.createObjectURL(file);
    setPreviewUrl(tempUrl);

    try {
      const compressed = await compressImage(file);
      setCompressedBlob(compressed.blob);
      setPreviewUrl(compressed.base64);
    } catch (err) {
      console.error("Compression failed:", err);
      alert("Image compression failed. File is corrupt or unsupported.");
    }
  };

  // ----------------------------------------------------
  // WORKER ANALYSIS & SAVE PROCESS
  // ----------------------------------------------------
  const handleAnalyzeAndTrack = async () => {
    setIsAnalyzing(true);
    setAnalysisResult(null);

    const payload = {};
    if (logType === 'text' && textDescription) {
      payload.text = textDescription;
    } else if (previewUrl) {
      payload.image = previewUrl; // Base64 data URL
      if (textDescription) {
        payload.text = textDescription;
      }
    }

    try {
      const response = await fetch(workerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Worker returned error: ${response.status} - ${errText}`);
      }

      const result = await response.json();
      setAnalysisResult(result);
      
      // Initialize edit fields
      setEditMealName(result.food_item);
      setEditCalories(result.calories);
      setEditProtein(result.protein_g);
      setEditCarbs(result.carbs_g);
      setEditFat(result.fat_g);

    } catch (err) {
      console.error("AI Analysis failed:", err);
      alert("AI analysis failed. Please verify worker setup or fill in metrics manually.");
      
      // Setup raw manual fallback editor values
      setAnalysisResult({
        food_item: "Unknown Meal",
        calories: 0,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
        confidence: 0,
        explanation: "Manual backup entry."
      });
      setEditMealName("Manual Entry");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSaveMeal = async () => {
    if (!editMealName) return;

    // Detect if values were manipulated by user (PRD edit tracking requirement)
    const isEdited = 
      editMealName !== analysisResult.food_item ||
      Number(editCalories) !== analysisResult.calories ||
      Number(editProtein) !== analysisResult.protein_g ||
      Number(editCarbs) !== analysisResult.carbs_g ||
      Number(editFat) !== analysisResult.fat_g;

    const newLogItem = {
      user_id: user.id,
      meal_name: editMealName,
      calories: Number(editCalories),
      protein_g: Number(editProtein),
      carbs_g: Number(editCarbs),
      fat_g: Number(editFat),
      thumbnail_path: null,
      ai_confidence: analysisResult.confidence || 0,
      is_edited: isEdited,
      original_calories: analysisResult.calories || 0,
      original_protein_g: analysisResult.protein_g || 0,
      original_carbs_g: analysisResult.carbs_g || 0,
      original_fat_g: analysisResult.fat_g || 0,
      created_at: new Date().toISOString()
    };

    if (useDemo) {
      newLogItem.id = Math.random().toString(36).substr(2, 9);
      const updatedLogs = [newLogItem, ...logs];
      setLogs(updatedLogs);
      localStorage.setItem('demo_macro_logs', JSON.stringify(updatedLogs));
      resetLogState();
      setCurrentTab('today');
      return;
    }

    try {
      // 1. Upload thumbnail to Supabase storage if file exists
      if (compressedBlob) {
        const filePath = `${user.id}/${Date.now()}.jpg`;
        const { error: uploadErr } = await supabase.storage
          .from('thumbnails')
          .upload(filePath, compressedBlob, { contentType: 'image/jpeg' });

        if (uploadErr) throw uploadErr;
        newLogItem.thumbnail_path = filePath;
      }

      // 2. Insert DB record
      const { error: dbErr } = await supabase
        .from('macro_logs')
        .insert(newLogItem);
      
      if (dbErr) throw dbErr;

      loadUserData(user.id);
      resetLogState();
      setCurrentTab('today');
    } catch (err) {
      alert("Failed to save meal log: " + err.message);
    }
  };

  const resetLogState = () => {
    setTextDescription('');
    setSelectedImage(null);
    setPreviewUrl(null);
    setCompressedBlob(null);
    setAnalysisResult(null);
    stopCamera();
  };

  // ----------------------------------------------------
  // DAILY TOTALS CALCULATOR
  // ----------------------------------------------------
  const getDailyTotals = (userId = user?.id) => {
    const todayStr = new Date().toDateString();
    const todayLogs = logs.filter(l => l.user_id === userId && new Date(l.created_at).toDateString() === todayStr);

    return todayLogs.reduce((totals, item) => {
      totals.calories += item.calories;
      totals.protein += item.protein_g;
      totals.carbs += item.carbs_g;
      totals.fat += item.fat_g;
      return totals;
    }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
  };

  const todayTotals = getDailyTotals();

  // ----------------------------------------------------
  // VIEW RENDER HANDLERS
  // ----------------------------------------------------

  // Tab 1: Today Screen (Apple Ring Graphics)
  const renderTodayTab = () => {
    const calGoal = profile?.daily_calorie_goal || 2000;
    const pGoal = profile?.daily_protein_goal || 150;
    const cGoal = profile?.daily_carb_goal || 200;
    const fGoal = profile?.daily_fat_goal || 70;

    const calPercent = Math.min((todayTotals.calories / calGoal) * 100, 100);
    const pPercent = Math.min((todayTotals.protein / pGoal) * 100, 100);
    const cPercent = Math.min((todayTotals.carbs / cGoal) * 100, 100);
    const fPercent = Math.min((todayTotals.fat / fGoal) * 100, 100);

    // SVG arc math helpers for concentric rings
    const getStrokeDash = (percent, radius) => {
      const circ = 2 * Math.PI * radius;
      const offset = circ * (1 - percent / 100);
      return { strokeDasharray: circ, strokeDashoffset: offset };
    };

    return (
      <div className="animate-fade-in" style={{ padding: '20px' }}>
        <h1 className="page-header">Daily Dashboard</h1>
        
        {/* Welcome Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Welcome back,</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{profile?.display_name || 'Family Tracker'}</div>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
            {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        </div>

        {/* Apple style concentric Ring Card */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', marginBottom: '20px' }}>
          <h2 className="section-header" style={{ width: '100%', textAlign: 'left' }}>Today's Macros</h2>
          
          <div style={{ position: 'relative', width: '220px', height: '220px' }}>
            {/* SVG Ring Container */}
            <svg width="220" height="220" viewBox="0 0 220 220" style={{ transform: 'rotate(-90deg)' }}>
              {/* Outer Ring: Protein (Neon Mint) */}
              <circle cx="110" cy="110" r="90" stroke="rgba(16, 185, 129, 0.05)" strokeWidth="12" fill="none" />
              <circle cx="110" cy="110" r="90" stroke="var(--color-protein)" strokeWidth="12" strokeLinecap="round" fill="none"
                style={{
                  transition: 'stroke-dashoffset 0.8s ease-in-out',
                  ...getStrokeDash(pPercent, 90)
                }}
              />
              
              {/* Middle Ring: Carbs (Sunset Gold) */}
              <circle cx="110" cy="110" r="74" stroke="rgba(245, 158, 11, 0.05)" strokeWidth="12" fill="none" />
              <circle cx="110" cy="110" r="74" stroke="var(--color-carbs)" strokeWidth="12" strokeLinecap="round" fill="none"
                style={{
                  transition: 'stroke-dashoffset 0.8s ease-in-out',
                  ...getStrokeDash(cPercent, 74)
                }}
              />

              {/* Inner Ring: Fats (Coral Red) */}
              <circle cx="110" cy="110" r="58" stroke="rgba(239, 68, 68, 0.05)" strokeWidth="12" fill="none" />
              <circle cx="110" cy="110" r="58" stroke="var(--color-fat)" strokeWidth="12" strokeLinecap="round" fill="none"
                style={{
                  transition: 'stroke-dashoffset 0.8s ease-in-out',
                  ...getStrokeDash(fPercent, 58)
                }}
              />
            </svg>
            
            {/* Centered Calories counter inside rings */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Calories</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-calories)' }}>{todayTotals.calories}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>of {calGoal} kcal</div>
            </div>
          </div>

          {/* Individual bar breakdowns below the rings */}
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Protein bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '3px' }}>
                <span style={{ color: 'var(--color-protein)', fontWeight: 600 }}>Protein</span>
                <span style={{ color: 'var(--text-secondary)' }}>{todayTotals.protein}g / {pGoal}g</span>
              </div>
              <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${pPercent}%`, height: '100%', background: 'var(--color-protein)', borderRadius: '3px', transition: 'width 0.5s ease' }}></div>
              </div>
            </div>

            {/* Carbs bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '3px' }}>
                <span style={{ color: 'var(--color-carbs)', fontWeight: 600 }}>Carbs</span>
                <span style={{ color: 'var(--text-secondary)' }}>{todayTotals.carbs}g / {cGoal}g</span>
              </div>
              <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${cPercent}%`, height: '100%', background: 'var(--color-carbs)', borderRadius: '3px', transition: 'width 0.5s ease' }}></div>
              </div>
            </div>

            {/* Fat bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '3px' }}>
                <span style={{ color: 'var(--color-fat)', fontWeight: 600 }}>Fat</span>
                <span style={{ color: 'var(--text-secondary)' }}>{todayTotals.fat}g / {fGoal}g</span>
              </div>
              <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${fPercent}%`, height: '100%', background: 'var(--color-fat)', borderRadius: '3px', transition: 'width 0.5s ease' }}></div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom widgets row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h2 className="section-header" style={{ margin: 0 }}>Meal Logs</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '120px', overflowY: 'auto' }}>
              {logs.filter(l => l.user_id === user.id && new Date(l.created_at).toDateString() === new Date().toDateString()).map((l, i) => (
                <div key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.meal_name}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{l.calories} kcal • {l.protein_g}g P</div>
                </div>
              ))}
              {logs.filter(l => l.user_id === user.id && new Date(l.created_at).toDateString() === new Date().toDateString()).length === 0 && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No logs logged today.</div>
              )}
            </div>
          </div>

          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h2 className="section-header" style={{ margin: 0 }}>Family Summary</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '120px', overflowY: 'auto' }}>
              {familyProfiles.filter(p => p.id !== profile.id && p.share_with_family).map((p, i) => {
                const fTotals = getDailyTotals(p.id);
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>{p.display_name}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-calories)', fontWeight: 600 }}>{fTotals.calories} kcal</span>
                  </div>
                );
              })}
              {familyProfiles.filter(p => p.id !== profile.id && p.share_with_family).length === 0 && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No shared members.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Tab 2: Family Feed Timeline (Apple Health style Binary Shared logs)
  const renderFamilyTab = () => {
    return (
      <div className="animate-fade-in" style={{ padding: '20px' }}>
        <h1 className="page-header">Family Feed</h1>
        
        {family ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <Users size={18} style={{ color: 'var(--color-protein)' }} />
              <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>Group: {family.family_name}</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {sharedFeed.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                  No meal history logged in the family group today.
                </div>
              ) : (
                sharedFeed.map((item, idx) => {
                  const itemUser = familyProfiles.find(p => p.id === item.user_id) || {};
                  const isOwn = item.user_id === user.id;
                  
                  return (
                    <div key={idx} className="glass-panel" style={{ display: 'flex', gap: '14px', alignItems: 'start' }}>
                      {/* Optional Thumbnail Container */}
                      <div style={{ 
                        width: '50px', 
                        height: '50px', 
                        borderRadius: '10px', 
                        backgroundColor: 'rgba(255,255,255,0.05)', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        overflow: 'hidden',
                        border: '1px solid rgba(255,255,255,0.05)'
                      }}>
                        {item.thumbnail_path ? (
                          <img 
                            src={useDemo ? item.thumbnail_path : `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/thumbnails/${item.thumbnail_path}`} 
                            alt="Food" 
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                          />
                        ) : (
                          <span style={{ fontSize: '1.2rem' }}>🍲</span>
                        )}
                      </div>

                      {/* Log details */}
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: isOwn ? 'var(--color-calories)' : 'var(--text-primary)' }}>
                            {itemUser.display_name || 'Family Member'}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        
                        <div style={{ fontSize: '0.9rem', fontWeight: 500, margin: '4px 0' }}>{item.meal_name}</div>
                        
                        {/* Macro details */}
                        <div style={{ display: 'flex', gap: '12px', marginTop: '6px' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-calories)', background: 'rgba(6,182,212,0.08)', padding: '2px 6px', borderRadius: '4px' }}>
                            {item.calories} kcal
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-protein)', background: 'rgba(16,185,129,0.08)', padding: '2px 6px', borderRadius: '4px' }}>
                            {item.protein_g}g P
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-carbs)', background: 'rgba(245,158,11,0.08)', padding: '2px 6px', borderRadius: '4px' }}>
                            {item.carbs_g}g C
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-fat)', background: 'rgba(239,68,68,0.08)', padding: '2px 6px', borderRadius: '4px' }}>
                            {item.fat_g}g F
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '24px' }}>
            <div style={{ textAlign: 'center', marginBottom: '10px' }}>
              <Users size={48} style={{ color: 'var(--color-protein)', marginBottom: '12px' }} />
              <h2 className="section-header" style={{ fontSize: '1.25rem' }}>No Family Bound</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>You must either create a new family group or enter an active invite code to start tracking together.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Create a New Family</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input 
                    type="text" 
                    placeholder="Family Name (e.g. Greens)" 
                    value={newFamilyName}
                    onChange={e => setNewFamilyName(e.target.value)}
                    style={{ flex: 1, padding: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', fontSize: '0.85rem' }} 
                  />
                  <button 
                    onClick={handleCreateFamily}
                    style={{ padding: '10px 16px', background: 'var(--color-protein)', border: 'none', borderRadius: '8px', color: 'black', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}
                  >
                    Create
                  </button>
                </div>
              </div>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', margin: '10px 0' }}></div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Or Join with Invite Code</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input 
                    type="text" 
                    placeholder="Invite Code (e.g. FAM-123)" 
                    value={inviteCode}
                    onChange={e => setInviteCode(e.target.value)}
                    style={{ flex: 1, padding: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', fontSize: '0.85rem' }} 
                  />
                  <button 
                    onClick={handleJoinFamily}
                    style={{ padding: '10px 16px', background: '#8B5CF6', border: 'none', borderRadius: '8px', color: 'white', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}
                  >
                    Join
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Tab 3: Log Modal (Camera Capture + AI Processing Forms)
  const renderLogTab = () => {
    return (
      <div className="animate-fade-in" style={{ padding: '20px' }}>
        <h1 className="page-header">Log Meal</h1>

        {isAnalyzing ? (
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: '20px' }}>
            <div className="spinner" style={{ 
              width: '60px', 
              height: '60px', 
              borderRadius: '50%', 
              border: '4px solid rgba(255,255,255,0.05)', 
              borderTopColor: 'var(--color-protein)',
              animation: 'spin 1s linear infinite'
            }}></div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 600, fontSize: '1.05rem', color: 'white' }}>AI Analysis in Progress...</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Evaluating nutrition parameters with Groq</div>
            </div>
          </div>
        ) : analysisResult ? (
          /* CONFIRMATION / EDITS SCREEN */
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h2 className="section-header" style={{ margin: 0 }}>Review AI Analysis</h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>AI Confidence: {(analysisResult.confidence * 100).toFixed(0)}%</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Meal Description</label>
                <input 
                  type="text" 
                  value={editMealName}
                  onChange={e => setEditMealName(e.target.value)}
                  style={{ padding: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', fontSize: '0.85rem' }} 
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Calories (kcal)</label>
                  <input 
                    type="number" 
                    value={editCalories}
                    onChange={e => setEditCalories(e.target.value)}
                    style={{ padding: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', fontSize: '0.85rem' }} 
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Protein (g)</label>
                  <input 
                    type="number" 
                    value={editProtein}
                    onChange={e => setEditProtein(e.target.value)}
                    style={{ padding: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', fontSize: '0.85rem' }} 
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Carbs (g)</label>
                  <input 
                    type="number" 
                    value={editCarbs}
                    onChange={e => setEditCarbs(e.target.value)}
                    style={{ padding: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', fontSize: '0.85rem' }} 
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Fat (g)</label>
                  <input 
                    type="number" 
                    value={editFat}
                    onChange={e => setEditFat(e.target.value)}
                    style={{ padding: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', fontSize: '0.85rem' }} 
                  />
                </div>
              </div>

              {analysisResult.explanation && (
                <div style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <strong>Analysis reasoning:</strong> {analysisResult.explanation}
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button 
                  onClick={resetLogState}
                  className="glass-panel"
                  style={{ flex: 1, padding: '12px 0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', cursor: 'pointer', background: 'none', fontWeight: 600 }}
                >
                  Discard
                </button>
                <button 
                  onClick={handleSaveMeal}
                  style={{ flex: 1, padding: '12px 0', background: 'var(--color-protein)', border: 'none', borderRadius: '8px', color: 'black', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  <Check size={16} /> Save Log
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* INITIAL INPUT SELECTOR SCREEN */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Input selectors */}
            <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <button 
                onClick={() => { stopCamera(); setLogType('text'); setPreviewUrl(null); }}
                style={{ flex: 1, padding: '8px 0', background: logType === 'text' ? 'rgba(255,255,255,0.08)' : 'none', border: 'none', borderRadius: '8px', color: 'white', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}
              >
                Write/Type
              </button>
              <button 
                onClick={startCamera}
                style={{ flex: 1, padding: '8px 0', background: logType === 'camera' ? 'rgba(255,255,255,0.08)' : 'none', border: 'none', borderRadius: '8px', color: 'white', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}
              >
                Use Camera
              </button>
              <button 
                onClick={() => { stopCamera(); setLogType('upload'); }}
                style={{ flex: 1, padding: '8px 0', background: logType === 'upload' ? 'rgba(255,255,255,0.08)' : 'none', border: 'none', borderRadius: '8px', color: 'white', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}
              >
                Upload Photo
              </button>
            </div>

            {/* Input display */}
            <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {logType === 'text' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Describe what you ate:</label>
                  <textarea 
                    placeholder="e.g. Had 1 cup of oatmeal with handful of almonds and 1 sliced banana" 
                    value={textDescription}
                    onChange={e => setTextDescription(e.target.value)}
                    rows={4}
                    style={{ width: '100%', padding: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', fontSize: '0.85rem', resize: 'none', outline: 'none' }}
                  />
                </div>
              )}

              {logType === 'camera' && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
                  <div style={{ position: 'relative', width: '100%', aspectRatio: '1', borderRadius: '12px', overflow: 'hidden', background: 'black', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <video ref={videoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <button 
                    onClick={capturePhoto}
                    style={{ width: '56px', height: '56px', borderRadius: '50%', border: '4px solid white', background: 'red', cursor: 'pointer' }}
                  />
                </div>
              )}

              {logType === 'upload' && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
                  {previewUrl ? (
                    <div style={{ position: 'relative', width: '100%', aspectRatio: '1', borderRadius: '12px', overflow: 'hidden', background: 'black', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <img src={previewUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button 
                        onClick={() => { setPreviewUrl(null); setCompressedBlob(null); }}
                        style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(239,68,68,0.8)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContext: 'center', color: 'white', cursor: 'pointer' }}
                      >
                        <Trash2 size={16} style={{ margin: 'auto' }} />
                      </button>
                    </div>
                  ) : (
                    <label style={{ width: '100%', height: '220px', border: '2px dashed rgba(255,255,255,0.15)', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: '10px' }}>
                      <Upload size={32} style={{ color: 'var(--text-secondary)' }} />
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Click to upload food photo</span>
                      <input type="file" accept="image/*" onChange={handleImageFileSelect} style={{ display: 'none' }} />
                    </label>
                  )}

                  {/* Optional text description to clarify image */}
                  {previewUrl && (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Add text details (optional)</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Avocado Toast (large size)"
                        value={textDescription}
                        onChange={e => setTextDescription(e.target.value)}
                        style={{ padding: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', fontSize: '0.85rem' }} 
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Analyze execution button */}
              <button 
                onClick={handleAnalyzeAndTrack}
                disabled={(logType === 'text' && !textDescription) || ((logType === 'upload' || logType === 'camera') && !previewUrl)}
                style={{ 
                  width: '100%', 
                  padding: '12px 0', 
                  background: 'var(--color-protein)', 
                  border: 'none', 
                  borderRadius: '8px', 
                  color: 'black', 
                  fontWeight: 700, 
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  opacity: ((logType === 'text' && !textDescription) || ((logType === 'upload' || logType === 'camera') && !previewUrl)) ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <Activity size={18} /> Analyze with Groq
              </button>
            </div>
            
            {/* Custom Worker endpoint configuration */}
            <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '15px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Key size={14} style={{ color: 'var(--text-secondary)' }} />
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Cloudflare Gateway URL:</span>
              </div>
              <input 
                type="text"
                value={workerUrl}
                onChange={e => setWorkerUrl(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: 'var(--text-secondary)', fontSize: '0.7rem' }}
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  // Tab 4: Trends & Analytics Tab (Personal 3-Month Protein, Family 2-Month History)
  const renderTrendsTab = () => {
    // Generate simple SVG line graph coordinates for mock historical logs
    // Let's create a 3-month daily mock list. In production, this would query supabase
    const getHistoricalData = () => {
      const today = new Date();
      const points = [];
      const days = 90; // 3 months
      
      for (let i = days; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        
        // Find if we have a log on that date
        const dateStr = d.toDateString();
        const dateLogs = logs.filter(l => l.user_id === user.id && new Date(l.created_at).toDateString() === dateStr);
        const macroVal = dateLogs.reduce((sum, log) => {
          if (selectedMacroType === 'protein') return sum + log.protein_g;
          if (selectedMacroType === 'calories') return sum + log.calories;
          if (selectedMacroType === 'carbs') return sum + log.carbs_g;
          if (selectedMacroType === 'fat') return sum + log.fat_g;
          return sum;
        }, 0);

        points.push({
          date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          value: macroVal || (useDemo ? Math.floor(40 + Math.random() * 120) : 0) // random placeholder in demo to populate graph
        });
      }
      return points;
    };

    const graphData = getHistoricalData();
    const maxValue = Math.max(...graphData.map(p => p.value), 200);
    const targetValue = selectedMacroType === 'protein' ? (profile?.daily_protein_goal || 150) :
                        selectedMacroType === 'calories' ? (profile?.daily_calorie_goal || 2000) :
                        selectedMacroType === 'carbs' ? (profile?.daily_carb_goal || 200) :
                        (profile?.daily_fat_goal || 70);

    // Render coordinates for SVG Polyline (width 360, height 120)
    const pointsString = graphData.map((pt, idx) => {
      const x = (idx / graphData.length) * 360;
      const y = 120 - (pt.value / maxValue) * 100;
      return `${x},${y}`;
    }).join(' ');

    const targetY = 120 - (targetValue / maxValue) * 100;

    return (
      <div className="animate-fade-in" style={{ padding: '20px' }}>
        <h1 className="page-header">Trends & Analytics</h1>

        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className="section-header" style={{ margin: 0 }}>Last 3 Months</h2>
            <select 
              value={selectedMacroType} 
              onChange={e => setSelectedMacroType(e.target.value)}
              style={{ padding: '4px 8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', fontSize: '0.8rem', outline: 'none' }}
            >
              <option value="protein">Protein Intake (g)</option>
              <option value="calories">Calorie Intake (kcal)</option>
              <option value="carbs">Carbs Intake (g)</option>
              <option value="fat">Fat Intake (g)</option>
            </select>
          </div>

          {/* SVG Line Graph */}
          <div style={{ position: 'relative', width: '100%', background: 'rgba(0,0,0,0.2)', padding: '10px 0', borderRadius: '10px' }}>
            <svg width="100%" height="120" viewBox="0 0 360 120">
              {/* Target Line */}
              <line x1="0" y1={targetY} x2="360" y2={targetY} stroke="var(--color-protein)" strokeWidth="1.5" strokeDasharray="4 4" />
              
              {/* Graph Line */}
              <polyline
                fill="none"
                stroke="var(--color-calories)"
                strokeWidth="2"
                points={pointsString}
              />
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)', padding: '0 10px' }}>
              <span>{graphData[0].date}</span>
              <span>{graphData[Math.floor(graphData.length / 2)].date}</span>
              <span>Today</span>
            </div>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <span>Goal Target: <strong>{targetValue}{selectedMacroType === 'calories' ? ' kcal' : 'g'}</strong></span>
            <span>Est. Avg: <strong>{Math.floor(graphData.reduce((s,p)=>s+p.value,0)/graphData.length)}{selectedMacroType === 'calories' ? ' kcal' : 'g'}</strong></span>
          </div>
        </div>

        {/* Family Member Trend access */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <h2 className="section-header">Family Members</h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {familyProfiles.filter(p => p.id !== profile.id).map((member, idx) => {
              const isSelected = selectedFamilyMemberId === member.id;
              const hasShared = member.share_with_family;
              
              return (
                <div key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem' }}>
                        👤
                      </div>
                      <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{member.display_name}</div>
                        <div style={{ fontSize: '0.7rem', color: hasShared ? 'var(--color-protein)' : 'var(--color-fat)' }}>
                          {hasShared ? 'Permissions: Full Sharing' : 'Permissions: Not Shared'}
                        </div>
                      </div>
                    </div>
                    {hasShared ? (
                      <button 
                        onClick={() => setSelectedFamilyMemberId(isSelected ? null : member.id)}
                        className="glass-panel"
                        style={{ padding: '6px 12px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', fontSize: '0.75rem', cursor: 'pointer', background: 'none' }}
                      >
                        {isSelected ? 'Close History' : 'View 2-Month History'}
                      </button>
                    ) : (
                      <Lock size={16} style={{ color: 'var(--text-muted)', marginRight: '10px' }} />
                    )}
                  </div>

                  {/* Shared 2-month breakdown sub-card */}
                  {isSelected && hasShared && (
                    <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>2-Month Daily Calorie Progress</div>
                      {/* Placeholder representation for Dad's 2-month query logs */}
                      <div style={{ display: 'flex', gap: '2px', height: '40px', alignItems: 'end' }}>
                        {Array.from({ length: 45 }).map((_, i) => (
                          <div 
                            key={i} 
                            style={{ 
                              flex: 1, 
                              height: `${30 + Math.random() * 70}%`, 
                              background: Math.random() > 0.3 ? 'var(--color-protein)' : 'rgba(255,255,255,0.05)',
                              borderRadius: '1px'
                            }}
                          />
                        ))}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        <span>2 Months Ago</span>
                        <span>Today</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {familyProfiles.filter(p => p.id !== profile.id).length === 0 && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '10px 0' }}>No family members connected.</div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Tab 5: Profile & Onboarding Settings Tab
  const renderProfileTab = () => {
    return (
      <div className="animate-fade-in" style={{ padding: '20px' }}>
        <h1 className="page-header">User Profile</h1>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* User Info card */}
          <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>
              🥑
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{profile?.display_name || 'Member'}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{user?.email}</div>
            </div>
          </div>

          {/* Daily Goals Editor */}
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h2 className="section-header" style={{ margin: 0 }}>Daily Macro Goals</h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Calories Target (kcal)</label>
                <input 
                  type="number" 
                  value={profile?.daily_calorie_goal || 0}
                  onChange={e => handleUpdateProfileSettings({ daily_calorie_goal: Number(e.target.value) })}
                  style={{ padding: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', fontSize: '0.8rem' }} 
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Protein Target (g)</label>
                <input 
                  type="number" 
                  value={profile?.daily_protein_goal || 0}
                  onChange={e => handleUpdateProfileSettings({ daily_protein_goal: Number(e.target.value) })}
                  style={{ padding: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', fontSize: '0.8rem' }} 
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Carbs Target (g)</label>
                <input 
                  type="number" 
                  value={profile?.daily_carb_goal || 0}
                  onChange={e => handleUpdateProfileSettings({ daily_carb_goal: Number(e.target.value) })}
                  style={{ padding: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', fontSize: '0.8rem' }} 
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Fat Target (g)</label>
                <input 
                  type="number" 
                  value={profile?.daily_fat_goal || 0}
                  onChange={e => handleUpdateProfileSettings({ daily_fat_goal: Number(e.target.value) })}
                  style={{ padding: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', fontSize: '0.8rem' }} 
                />
              </div>
            </div>
          </div>

          {/* Privacy & Sharing controls */}
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h2 className="section-header" style={{ margin: 0 }}>Privacy & Family Sharing</h2>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Share logs with family</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Allow family members to see meal logs and macro metrics</div>
              </div>
              <input 
                type="checkbox"
                checked={profile?.share_with_family || false}
                onChange={e => handleUpdateProfileSettings({ share_with_family: e.target.checked })}
                style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: 'var(--color-protein)' }}
              />
            </div>
            
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', margin: '4px 0' }}></div>
            
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '6px', alignItems: 'center' }}>
              <AlertCircle size={14} />
              <span>Image retention policy is globally locked to 3 months to save storage.</span>
            </div>
          </div>

          {/* Family Group Info & Invite Code */}
          {family && (
            <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <h2 className="section-header" style={{ margin: 0 }}>Connected Family Group</h2>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <span>Group Name:</span>
                <span style={{ fontWeight: 600, color: 'white' }}>{family.family_name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <span>Family Invite Code:</span>
                <span style={{ fontWeight: 700, color: 'var(--color-protein)', letterSpacing: '0.05em' }}>{family.invite_code}</span>
              </div>
            </div>
          )}

          {/* Mode Switcher */}
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '15px' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>Connection Mode:</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={() => setUseDemo(true)}
                style={{ flex: 1, padding: '8px 0', border: '1px solid rgba(255,255,255,0.1)', background: useDemo ? 'var(--color-protein)' : 'none', color: useDemo ? 'black' : 'white', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
              >
                Local Demo Mode
              </button>
              <button 
                onClick={() => {
                  if (!isSupabaseConfigured()) {
                    alert("Supabase keys are not set in .env. Setup Supabase first!");
                  } else {
                    setUseDemo(false);
                  }
                }}
                style={{ flex: 1, padding: '8px 0', border: '1px solid rgba(255,255,255,0.1)', background: !useDemo ? 'var(--color-protein)' : 'none', color: !useDemo ? 'black' : 'white', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
              >
                Supabase Sync
              </button>
            </div>
          </div>

          <button 
            onClick={handleSignOut}
            className="glass-panel" 
            style={{ width: '100%', padding: '12px 0', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '8px', color: '#EF4444', fontWeight: 700, cursor: 'pointer', background: 'rgba(239,68,68,0.05)', transition: 'background 0.2s' }}
            onMouseEnter={e => e.target.style.background = 'rgba(239,68,68,0.1)'}
            onMouseLeave={e => e.target.style.background = 'rgba(239,68,68,0.05)'}
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  };

  // ----------------------------------------------------
  // RENDER APP SHELL
  // ----------------------------------------------------
  return (
    <div className="app-container">
      {/* Demo banner indicator */}
      {useDemo && (
        <div style={{ background: 'linear-gradient(90deg, #F59E0B 0%, #D97706 100%)', color: 'black', fontSize: '0.75rem', fontWeight: 700, padding: '6px 0', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', zIndex: 101 }}>
          <AlertCircle size={14} />
          <span>Demo Sandbox Mode. Data stored locally.</span>
        </div>
      )}

      {/* Main content wrapper */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {!user ? (
          /* AUTH GATEWAY SCREEN */
          <div style={{ padding: '40px 20px', display: 'flex', flexDirection: 'column', gap: '20px', justifyContent: 'center', minHeight: '80vh' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '10px' }}>🥗</div>
              <h1 className="page-header" style={{ marginBottom: '6px' }}>Nutrient Tracker</h1>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Track daily macros with your family for free</p>
            </div>

            <form onSubmit={handleAuth} className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <h2 className="section-header" style={{ margin: 0 }}>{isRegistering ? 'Create Account' : 'Log In'}</h2>

              {authError && (
                <div style={{ padding: '10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', color: '#EF4444', fontSize: '0.75rem', display: 'flex', gap: '6px' }}>
                  <AlertCircle size={16} />
                  <span>{authError}</span>
                </div>
              )}

              {isRegistering && (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Your Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Sarah"
                      value={displayName}
                      onChange={e => setDisplayName(e.target.value)}
                      required
                      style={{ padding: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', fontSize: '0.85rem' }} 
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Age</label>
                      <input 
                        type="number" 
                        placeholder="28"
                        value={age}
                        onChange={e => setAge(e.target.value)}
                        style={{ padding: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', fontSize: '0.85rem', width: '100%' }} 
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Weight (kg)</label>
                      <input 
                        type="number" 
                        placeholder="70"
                        value={weight}
                        onChange={e => setWeight(e.target.value)}
                        style={{ padding: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', fontSize: '0.85rem', width: '100%' }} 
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Height (cm)</label>
                      <input 
                        type="number" 
                        placeholder="175"
                        value={height}
                        onChange={e => setHeight(e.target.value)}
                        style={{ padding: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', fontSize: '0.85rem', width: '100%' }} 
                      />
                    </div>
                  </div>
                </>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Email</label>
                <input 
                  type="email" 
                  placeholder="name@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  style={{ padding: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', fontSize: '0.85rem' }} 
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Password</label>
                <input 
                  type="password" 
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  style={{ padding: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', fontSize: '0.85rem' }} 
                />
              </div>

              <button 
                type="submit" 
                style={{ padding: '12px 0', background: 'var(--color-protein)', border: 'none', borderRadius: '8px', color: 'black', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', marginTop: '6px' }}
              >
                {isRegistering ? 'Sign Up' : 'Log In'}
              </button>

              <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
                {isRegistering ? 'Already have an account?' : 'New here?'}
                <button 
                  type="button" 
                  onClick={() => setIsRegistering(!isRegistering)}
                  style={{ background: 'none', border: 'none', color: 'var(--color-calories)', fontWeight: 600, cursor: 'pointer', marginLeft: '4px' }}
                >
                  {isRegistering ? 'Log In' : 'Sign Up'}
                </button>
              </div>

              {!isSupabaseConfigured() && (
                <button 
                  type="button"
                  onClick={() => setUseDemo(true)}
                  style={{ width: '100%', padding: '10px 0', border: '1px solid rgba(245,158,11,0.4)', borderRadius: '8px', color: '#F59E0B', fontWeight: 600, cursor: 'pointer', background: 'rgba(245,158,11,0.05)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  <RotateCcw size={14} /> Bypass Auth (Try Demo Sandbox)
                </button>
              )}
            </form>
          </div>
        ) : (
          /* MAIN TABS SELECTORS */
          <>
            {currentTab === 'today' && renderTodayTab()}
            {currentTab === 'family' && renderFamilyTab()}
            {currentTab === 'log' && renderLogTab()}
            {currentTab === 'trends' && renderTrendsTab()}
            {currentTab === 'profile' && renderProfileTab()}
          </>
        )}
      </div>

      {/* Navigation bar (Identical 5-Tab Bar across all screens) */}
      {user && (
        <div className="nav-bar">
          <button 
            onClick={() => { stopCamera(); setCurrentTab('today'); }} 
            className={`nav-item ${currentTab === 'today' ? 'active active-today' : ''}`}
          >
            <Activity size={20} />
            <span style={{ marginTop: '3px' }}>Today</span>
          </button>
          
          <button 
            onClick={() => { stopCamera(); setCurrentTab('family'); }} 
            className={`nav-item ${currentTab === 'family' ? 'active active-family' : ''}`}
          >
            <Users size={20} />
            <span style={{ marginTop: '3px' }}>Family</span>
          </button>

          {/* Plus center button */}
          <button 
            onClick={() => { setCurrentTab('log'); setLogType('text'); }}
            className="nav-item-log"
          >
            <Plus size={24} />
          </button>

          <button 
            onClick={() => { stopCamera(); setCurrentTab('trends'); }} 
            className={`nav-item ${currentTab === 'trends' ? 'active active-trends' : ''}`}
          >
            <TrendingUp size={20} />
            <span style={{ marginTop: '3px' }}>Trends</span>
          </button>

          <button 
            onClick={() => { stopCamera(); setCurrentTab('profile'); }} 
            className={`nav-item ${currentTab === 'profile' ? 'active active-profile' : ''}`}
          >
            <User size={20} />
            <span style={{ marginTop: '3px' }}>Profile</span>
          </button>
        </div>
      )}
    </div>
  );
}
