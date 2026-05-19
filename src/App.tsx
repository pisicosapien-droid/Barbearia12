import { useState, useEffect, useRef, FormEvent, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Instagram, 
  Facebook, 
  Mail, 
  Phone, 
  MapPin, 
  Calendar, 
  Clock, 
  MessageCircle,
  MessageSquare, 
  Scissors, 
  Menu, 
  X, 
  LogOut, 
  Settings,
  Globe,
  BarChart3,
  TrendingUp,
  ChevronRight,
  ChevronLeft,
  User,
  Users,
  CheckCircle2,
  Trash2,
  History as HistoryIcon,
  Upload,
  Check,
  Calendar as CalendarIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  ShieldCheck,
  Image as ImageIcon
} from 'lucide-react';
import { ImageUploader } from './components/ImageUploader';
import { addDoc, collection, serverTimestamp, onSnapshot, query, orderBy, where, getDocs, doc, updateDoc, deleteDoc, runTransaction, getDoc, setDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { Toaster, toast } from 'react-hot-toast';
import { db, auth, login, logout, handleFirestoreError, OperationType } from './lib/firebase';
import { BARBERSHOP_DATA, SERVICES, TESTIMONIALS, OPENING_HOURS, GALLERY_IMAGES, AUTHORIZED_EMAILS } from './constants';
import { Barber, Appointment } from './types';
import { cn } from './lib/utils';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, addMonths, subMonths, startOfToday, isBefore, startOfDay, isSameMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [userRole, setUserRole] = useState<'admin' | 'barber' | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]); // Selection data for clients (from public_barbers)
  const [staff, setStaff] = useState<Barber[]>([]); // Full info for admin management
  const [showFullHistory, setShowFullHistory] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [isDashboardView, setIsDashboardView] = useState(() => {
    return localStorage.getItem('isDashboardView') === 'true';
  });
  
  const toggleDashboardView = (val: boolean) => {
    setIsDashboardView(val);
    localStorage.setItem('isDashboardView', val.toString());
  };
  const [adminTab, setAdminTab] = useState<'appointments' | 'site' | 'barbers' | 'reports'>('appointments');
  const [siteTab, setSiteTab] = useState<'geral' | 'hero' | 'servicos' | 'sobre' | 'galeria' | 'contato'>('geral');
  const [selectedBarberId, setSelectedBarberId] = useState<string>('all');
  const [logoDragX, setLogoDragX] = useState(0);
  const [isBusySlotsLoading, setIsBusySlotsLoading] = useState(false);
  const [busySlots, setBusySlots] = useState<string[]>([]);
  const [deletingBarberId, setDeletingBarberId] = useState<string | null>(null);
  const [currentTestimonial, setCurrentTestimonial] = useState(0);

  // Auto-slide Testimonials
  useEffect(() => {
    if (isDashboardView) return;
    const interval = setInterval(() => {
      setCurrentTestimonial(prev => (prev + 1) % TESTIMONIALS.length);
    }, 6000); // 6 seconds for a comfortable read
    return () => clearInterval(interval);
  }, [isDashboardView, TESTIMONIALS.length]);
  
  // Site Data State
  const [siteData, setSiteData] = useState(BARBERSHOP_DATA);
  const [siteServices, setSiteServices] = useState(SERVICES);
  const [siteGallery, setSiteGallery] = useState(GALLERY_IMAGES);
  const [dashboardDate, setDashboardDate] = useState<Date>(startOfToday());
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
     const handleScroll = () => {
       setScrolled(window.scrollY > 300);
     };
     window.addEventListener('scroll', handleScroll);
     return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    serviceType: SERVICES[0].name,
    barberId: '',
    barberName: '',
    date: '',
    time: ''
  });

  // Persistent Form State - Restore
  useEffect(() => {
    const saved = localStorage.getItem('pending_booking');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.date && new Date(data.date) < startOfDay(new Date())) {
           // Skip old dates
        } else {
           setFormData(prev => ({ ...prev, ...data }));
        }
      } catch (e) {}
    }
  }, []);

  // Persistent Form State - Save
  useEffect(() => {
    localStorage.setItem('pending_booking', JSON.stringify(formData));
  }, [formData]);

  // Booking Timeout Logic
  useEffect(() => {
    let timeout: any;
    if (isLoading) {
      timeout = setTimeout(() => {
        setIsLoading(false);
        toast.error("O processamento está demorando muito. Verifique sua conexão e tente novamente em instantes.", {
          duration: 6000
        });
      }, 10000);
    }
    return () => clearTimeout(timeout);
  }, [isLoading]);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch Site Settings
  useEffect(() => {
    let unsub: (() => void) | undefined;
    try {
      unsub = onSnapshot(doc(db, 'settings', 'website'), (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setSiteData(prev => ({ ...prev, ...data }));
          if (data.services) setSiteServices(data.services);
          if (data.galleryImages) setSiteGallery(data.galleryImages);
        }
      }, (error) => {
        console.error("Firestore monitor (settings):", error);
      });
    } catch (err) {
      console.error("Setup error (settings):", err);
    }
    return () => unsub?.();
  }, []);

  // Fetch Barbers (Public Selection - ALWAYS open)
  useEffect(() => {
    let unsub: (() => void) | undefined;
    try {
      unsub = onSnapshot(collection(db, 'public_barbers'), (snapshot) => {
        const barbersList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Barber));
        setBarbers(barbersList);
        
        if (barbersList.length > 0) {
           setFormData(prev => {
             if (prev.barberId) return prev;
             const firstBarber = barbersList[0];
             return { 
               ...prev, 
               barberId: firstBarber.id, 
               barberName: firstBarber.name 
             };
           });
        }
      }, (error) => {
        console.error("Firestore monitor (public_barbers):", error.message);
      });
    } catch (err) {
      console.error("Setup error (public_barbers):", err);
    }
    return () => unsub?.();
  }, []);

  // Fetch Staff (Full Management Data - Only for Admin/Barber)
  useEffect(() => {
    let unsub: (() => void) | undefined;
    if (isAdmin || userRole === 'barber') {
      try {
        unsub = onSnapshot(collection(db, 'admins'), (snapshot) => {
          const staffList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Barber));
          setStaff(staffList);
        }, (error) => {
          console.error("Firestore monitor (staff):", error.message);
        });
      } catch (err) {
        console.error("Setup error (staff):", err);
      }
    } else {
      setStaff([]);
    }
    return () => unsub?.();
  }, [isAdmin, userRole]);

  // Fetch Appointments (Admin/Barber specific)
  useEffect(() => {
    let unsubApps: () => void = () => {};
    
    if (user && userRole) {
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      const sixtyDaysStr = sixtyDaysAgo.toISOString().split('T')[0];

      let appQuery;
      if (userRole === 'admin') {
        appQuery = showFullHistory 
          ? query(collection(db, 'appointments'), orderBy('date', 'desc'), orderBy('createdAt', 'desc'))
          : query(collection(db, 'appointments'), where('date', '>=', sixtyDaysStr), orderBy('date', 'desc'), orderBy('createdAt', 'desc'));
      } else {
        appQuery = query(
          collection(db, 'appointments'), 
          where('barberId', '==', user.uid),
          where('date', '>=', sixtyDaysStr),
          orderBy('date', 'desc'), 
          orderBy('createdAt', 'desc')
        );
      }

      unsubApps = onSnapshot(appQuery, (snapshot) => {
        setAppointments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment)));
      }, (err) => {
        console.error("Firestore monitor (appointments):", err);
      });
    }

    return () => unsubApps();
  }, [user, userRole, showFullHistory]);

  // Fetch Busy Slots (Real-time) - Read from public busy_slots collection to avoid appointment PII exposure
  useEffect(() => {
    let unsubBusy: () => void = () => {};

    if (formData.date && formData.barberId) {
      setIsBusySlotsLoading(true);
      const q = query(
        collection(db, 'busy_slots'),
        where('date', '==', formData.date),
        where('barberId', '==', formData.barberId),
        where('status', 'in', ['pending', 'confirmed'])
      );

      unsubBusy = onSnapshot(q, (snapshot) => {
        const slots = snapshot.docs.map(doc => doc.data().time);
        setBusySlots(slots);
        
        // If the current selected time is now busy, notify and clear
        if (formData.time && slots.includes(formData.time)) {
          setFormData(prev => ({ ...prev, time: '' }));
          toast.error('Este horário acaba de ser reservado por outro cliente. Por favor, escolha outro.', {
            duration: 5000,
            icon: '⏳'
          });
        }
        setIsBusySlotsLoading(false);
      }, (error) => {
        console.error("Error monitoring busy slots:", error);
        setIsBusySlotsLoading(false);
      });
    }

    return () => unsubBusy();
  }, [formData.date, formData.barberId, formData.time]); // Added formData.time to inner check logic or dependency if needed

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (currentUser) {
          setUser(currentUser);
          const adminDoc = await getDoc(doc(db, 'admins', currentUser.uid));
          
          if (adminDoc.exists()) {
            const data = adminDoc.data();
            const isHardcoded = AUTHORIZED_EMAILS.includes(currentUser.email || '');
            
            // Force admin for hardcoded emails if not already
            if (isHardcoded && data.role !== 'admin') {
              await setDoc(doc(db, 'admins', currentUser.uid), { role: 'admin' }, { merge: true });
              data.role = 'admin';
            }

            setUserRole(data.role as any);
            setIsAdmin(data.role === 'admin');
            
            // Only force dashboard on first login or if remembered
            if (localStorage.getItem('isDashboardView') === null) {
              toggleDashboardView(true);
            }

            // Sync Profile (Always sync on login for staff)
            if (data.role === 'barber' || data.role === 'admin') {
               try {
                  const updates: any = {
                    name: currentUser.displayName || data.name || 'Barbeiro',
                    photo: currentUser.photoURL || data.photo || '',
                    email: currentUser.email,
                    role: data.role // Preserve role
                  };
                  const publicUpdates = {
                    name: currentUser.displayName || data.name || 'Barbeiro',
                    photo: currentUser.photoURL || data.photo || '',
                    id: currentUser.uid
                  };
                  await setDoc(doc(db, 'admins', currentUser.uid), updates, { merge: true });
                  await setDoc(doc(db, 'public_barbers', currentUser.uid), publicUpdates, { merge: true });
               } catch (e) {
                  console.warn("Profile sync failed:", e);
               }
            }
          } else {
            const isHardcoded = AUTHORIZED_EMAILS.includes(currentUser.email || '');
            const q = query(collection(db, 'admins'), where('email', '==', currentUser.email));
            const querySnapshot = await getDocs(q);
            const invitation = querySnapshot.docs[0];

            if (isHardcoded || invitation) {
              const adminsRef = collection(db, 'admins');
              const existingAdmins = await getDocs(adminsRef);
              const isFirst = existingAdmins.empty;
              const finalRole = (isFirst || isHardcoded) ? 'admin' : (invitation?.data()?.role || 'barber');
              
              await setDoc(doc(db, 'admins', currentUser.uid), {
                email: currentUser.email,
                name: currentUser.displayName || (invitation?.data()?.name !== 'Pendente' ? invitation?.data()?.name : 'Barbeiro'),
                photo: currentUser.photoURL || '',
                role: finalRole,
                userId: currentUser.uid // Ensure UID is tracked
              }, { merge: true });

              if (finalRole === 'barber' || finalRole === 'admin') {
                // Sync Public Profile (No sensitive info)
                await setDoc(doc(db, 'public_barbers', currentUser.uid), {
                  name: currentUser.displayName || (invitation?.data()?.name !== 'Pendente' ? invitation?.data()?.name : 'Barbeiro'),
                  photo: currentUser.photoURL || '',
                  id: currentUser.uid
                }, { merge: true });
              }

              if (invitation && invitation.id !== currentUser.uid) {
                 await deleteDoc(doc(db, 'admins', invitation.id));
              }
              
              setUserRole(finalRole as any);
              setIsAdmin(finalRole === 'admin');
              toggleDashboardView(true);
            } else {
              setIsDashboardView(false);
              setIsAdmin(false);
              setUserRole(null);
            }
          }
        } else {
          setUser(null);
          setIsAdmin(false);
          setUserRole(null);
          setAppointments([]);
          setIsDashboardView(false);
        }
      } catch (err) {
        console.error("Auth status change error:", err);
        toast.error("Erro ao autenticar. Por favor, tente recarregar a página.");
      } finally {
        setIsAppLoading(false);
      }
    });

    return () => unsubscribe();
  }, [db]);

  const saveSettings = async (newData: any) => {
    // Only admins or authorized emails can edit site settings
    const isAuthorized = isAdmin || AUTHORIZED_EMAILS.includes(user?.email || '');
    if (!isAuthorized) {
      toast.error("Permissão negada para editar o site");
      return;
    }

    const loadingToast = toast.loading('Salvando alterações...');
    try {
      await setDoc(doc(db, 'settings', 'website'), newData, { merge: true });
      toast.success("Site atualizado com sucesso!", { id: loadingToast });
    } catch (error: any) {
      console.error("Error saving settings:", error);
      toast.error("Erro ao salvar: " + (error.message || 'Sem resposta'), { id: loadingToast });
    }
  };

  const handleBooking = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      const loginLoading = toast.loading('Redirecionando para login...');
      try {
        // Save state one last time before redirecting
        localStorage.setItem('pending_booking', JSON.stringify(formData));
        await login();
        toast.success('Login realizado com sucesso!', { id: loginLoading });
        return;
      } catch (err) {
        toast.error('Erro ao fazer login', { id: loginLoading });
        return;
      }
    }

    if (busySlots.includes(formData.time)) {
      setFormData(prev => ({ ...prev, time: '' }));
      toast.error('Este horário acaba de ser reservado. Por favor, escolha outro.');
      return;
    }

    setIsLoading(true);
    const loadingToast = toast.loading('Finalizando seu agendamento...');
    
    try {
      // UNIQUE SLOT ID to prevent double bookings via transaction & index
      const slotId = `${formData.barberId}_${formData.date}_${formData.time.replace(':', '')}`;
      
      const selectedService = siteServices.find(s => s.name === formData.serviceType);
      const servicePrice = selectedService ? selectedService.price : '0';

      await runTransaction(db, async (transaction) => {
        const appointmentRef = doc(db, 'appointments', slotId);
        const busySlotRef = doc(db, 'busy_slots', slotId);
        const docSnap = await transaction.get(appointmentRef);
        
        const isAvailable = !docSnap.exists() || docSnap.data().status === 'cancelled' || docSnap.data().status === 'completed';
        
        if (!isAvailable) {
           throw new Error('SLOT_OCCUPIED');
        }


        const appData = {
          ...formData,
          servicePrice, // Save price at the time of booking
          clientName: user.displayName || 'Cliente',
          clientEmail: user.email,
          clientPhoto: user.photoURL || '',
          clientId: user.uid,
          status: 'pending',
          createdAt: serverTimestamp()
        };

        // Public slot data (no PII)
        const busyData = {
          date: formData.date,
          time: formData.time,
          barberId: formData.barberId,
          status: 'pending',
          createdAt: serverTimestamp()
        };

        transaction.set(appointmentRef, appData);
        transaction.set(busySlotRef, busyData);
      });

      // Clear persistence immediately after success
      localStorage.removeItem('pending_booking');

      toast.success('Agendamento realizado com sucesso!', { id: loadingToast });
      
      setFormData({
        ...formData,
        name: '',
        phone: '',
        date: '',
        time: ''
      });
    } catch (error: any) {
      if (error.message === 'SLOT_OCCUPIED') {
         toast.error('Infelizmente este horário foi ocupado agora pouco. Escolha outro horário, por favor.', { id: loadingToast });
         setFormData(prev => ({ ...prev, time: '' }));
      } else {
         toast.error('Erro ao agendar. Tente novamente.', { id: loadingToast });
         handleFirestoreError(error, OperationType.CREATE, 'appointments');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const getAvailableSlots = useCallback(() => {
    if (!formData.date) return [];
    // Use UTC date to avoid ANY local TZ shifts
    const date = new Date(`${formData.date}T12:00:00Z`);
    const weekDay = date.getUTCDay();
    
    if (weekDay === 0 || weekDay === 1) return []; // Sunday or Monday

    const slots = [];
    const isSaturday = weekDay === 6;
    
    let currentHour = 9;
    let currentMin = 0;
    const endHour = isSaturday ? 16 : 19;
    const endMin = 40; // Allow last slot to start up to 18:20/15:20 or close

    while (currentHour < endHour || (currentHour === endHour && currentMin === 0)) {
      const timeStr = `${currentHour.toString().padStart(2, '0')}:${currentMin.toString().padStart(2, '0')}`;
      slots.push(timeStr);
      
      currentMin += 40;
      if (currentMin >= 60) {
        currentHour += Math.floor(currentMin / 60);
        currentMin = currentMin % 60;
      }
    }

    return slots;
  }, [formData.date]);

   const handleLogout = async () => {
    await logout();
    setIsDashboardView(false);
    toast.success("Você saiu do painel");
  };

  const promoteToAdmin = async (barberId: string) => {
    if (!isAdmin) return;
    try {
       await setDoc(doc(db, 'admins', barberId), { role: 'admin' }, { merge: true });
       toast.success('Usuário promovido a Admin');
    } catch (e) {
       toast.error('Erro ao promover');
    }
  };

  const toggleUserRole = async (barberId: string, currentRole: 'admin' | 'barber') => {
    if (!isAdmin) return;
    const newRole = currentRole === 'admin' ? 'barber' : 'admin';
    try {
       await setDoc(doc(db, 'admins', barberId), { 
         role: newRole
       }, { merge: true });
       
       // Also sync to public_barbers if they were a barber or are becoming one
       const docSnap = await getDoc(doc(db, 'admins', barberId));
       if (docSnap.exists()) {
          const data = docSnap.data();
          await setDoc(doc(db, 'public_barbers', barberId), {
            name: data.name,
            photo: data.photo || '',
            id: barberId
          }, { merge: true });
       }
       
       toast.success('Permissão alterada');
    } catch (e) {
       toast.error('Erro ao alterar permissão');
    }
  };

  const removeBarber = async (barberId: string | null) => {
    if (!barberId) return;
    console.log("Attempting to remove barber:", barberId);
    
    if (userRole !== 'admin' && !isAdmin) {
      toast.error('Você não tem permissão de administrador');
      setDeletingBarberId(null);
      return;
    }
    
    if (barberId === user?.uid) {
      toast.error('Você não pode remover a si mesmo da equipe');
      setDeletingBarberId(null);
      return;
    }

    const loadingToast = toast.loading('Removendo colaborador...');
    try {
       await deleteDoc(doc(db, 'admins', barberId));
       await deleteDoc(doc(db, 'public_barbers', barberId));
       toast.success('Colaborador removido com sucesso', { id: loadingToast });
       setDeletingBarberId(null);
    } catch (e: any) {
       console.error("Erro detalhado ao remover barbeiro:", e);
       toast.error('Erro ao remover: ' + (e.message || 'Sem resposta do servidor'), { id: loadingToast });
       setDeletingBarberId(null);
    }
  };

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      // Use setDoc with merge: true to avoid "No document to update" errors
      await setDoc(doc(db, 'appointments', id), { status: newStatus }, { merge: true });
      // Sync with busy_slots (public tracking)
      await setDoc(doc(db, 'busy_slots', id), { status: newStatus }, { merge: true });
      toast.success('Status atualizado!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `appointments/${id}`);
    }
  };

  const deleteAppointment = async (id: string) => {
    if (!confirm('Deseja excluir este agendamento?')) return;
    try {
      await deleteDoc(doc(db, 'appointments', id));
      // Sync with busy_slots (public tracking)
      await deleteDoc(doc(db, 'busy_slots', id));
      toast.success('Agendamento excluído!');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `appointments/${id}`);
    }
  };

  if (isAppLoading) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center">
        <div className="relative">
          <div className="w-20 h-20 border-2 border-gold/10 border-t-gold rounded-full animate-spin" />
          {siteData.logoUrl ? (
            <img src={siteData.logoUrl} className="absolute inset-0 m-auto w-8 h-8 object-contain animate-pulse" alt="Logo" />
          ) : (
            <Scissors className="absolute inset-0 m-auto w-8 h-8 text-gold animate-pulse" />
          )}
        </div>
        <p className="mt-8 text-[10px] uppercase tracking-[0.4em] text-white/40 font-bold animate-pulse">Sincronizando Sistema...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white selection:bg-gold/30">
      <style>{`
        .logo-rotation-on-drag {
          transform: ${logoDragX > 10 ? 'rotate(45deg)' : 'rotate(0deg)'};
        }
      `}</style>
      <Toaster position="top-center" />
      
      {/* Deletion Confirmation Modal */}
      <AnimatePresence>
        {deletingBarberId && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setDeletingBarberId(null);
                toast.error("Remoção cancelada", { 
                  icon: "✖",
                  style: { background: '#18181b', color: '#fff', border: '1px solid rgba(255,255,255,0.05)', fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.1em' } 
                });
              }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-neutral-900 border border-white/10 p-8 rounded-sm shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-display font-bold text-white mb-2 uppercase italic tracking-tight">Excluir?</h3>
              <p className="text-white/50 text-[11px] mb-8 leading-relaxed uppercase tracking-widest font-bold">
                Tem certeza que deseja remover este membro da equipe?
              </p>
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => {
                    setDeletingBarberId(null);
                    toast.error("Remoção cancelada", { 
                      icon: "✖",
                      style: { background: '#18181b', color: '#fff', border: '1px solid rgba(255,255,255,0.05)', fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.1em' } 
                    });
                  }}
                  className="py-3 px-6 bg-white/5 hover:bg-white/10 text-white font-bold uppercase tracking-widest text-[10px] rounded-sm transition-all"
                >
                  Não
                </button>
                <button 
                  onClick={() => removeBarber(deletingBarberId)}
                  className="py-3 px-6 bg-red-500 hover:bg-red-600 text-white font-bold uppercase tracking-widest text-[10px] rounded-sm transition-all shadow-lg shadow-red-500/20"
                >
                  Sim
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      {!isDashboardView ? (
        <>
          {/* Navigation */}
          <nav className="fixed top-0 w-full z-50 bg-black/80 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="relative flex items-center h-full">
            {/* Drag Track hint */}
            <div className="absolute left-0 h-1 bg-white/5 rounded-full overflow-hidden w-40 -z-10 opacity-20">
              <motion.div 
                style={{ width: logoDragX }}
                className="h-full bg-gold"
              />
            </div>

            <motion.div 
              drag="x"
              dragConstraints={{ left: 0, right: 120 }}
              dragElastic={0.1}
              onDrag={(e, info) => setLogoDragX(info.offset.x)}
              onDragEnd={(e, info) => {
                if (info.offset.x > 110) {
                  if (!user) {
                    login();
                  } else {
                    // Check authorization before entering dashboard
                    const isAuthorized = isAdmin || userRole === 'barber' || AUTHORIZED_EMAILS.includes(user.email || '');
                    if (isAuthorized) {
                      toggleDashboardView(true);
                      window.scrollTo(0, 0);
                      toast.success("Acessando Painel de Controle", {
                        icon: "🔒",
                        style: { background: '#18181b', color: '#fff', fontSize: '10px', textTransform: 'uppercase' }
                      });
                    } else {
                      toast.error("Acesso negado para este usuário.");
                    }
                  }
                }
                setLogoDragX(0);
              }}
              style={{ x: logoDragX }}
              animate={{ 
                scale: 1 + (logoDragX / 1000),
                opacity: 1 - (logoDragX / 400)
              }}
              className="flex items-center gap-3 cursor-grab active:cursor-grabbing z-50 py-2 group"
            >
              <div className="relative">
                {siteData.logoUrl ? (
                  <img 
                    src={siteData.logoUrl} 
                    className={cn(
                      "w-6 h-6 object-contain transition-transform duration-300",
                      logoDragX > 10 ? "rotate-45" : "rotate-0"
                    )} 
                    alt="Logo"
                  />
                ) : (
                  <Scissors className={cn(
                    "text-gold w-6 h-6 transition-transform duration-300",
                    logoDragX > 10 ? "rotate-45" : "rotate-0"
                  )} />
                )}
                {logoDragX > 110 && (
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1 w-2 h-2 bg-gold rounded-full shadow-[0_0_10px_#FFD700]" 
                  />
                )}
              </div>
              <span className="font-display font-bold tracking-tight text-xl uppercase italic select-none">
                {logoDragX > 100 ? 'Acessar' : 'D\'Biazzi'}
              </span>
              
              {/* Tooltip hint */}
              <div className="absolute -bottom-10 left-0 whitespace-nowrap opacity-0 group-hover:opacity-40 transition-opacity pointer-events-none">
                 <p className="text-[8px] uppercase tracking-[0.2em] font-bold">Arraste para o Painel</p>
              </div>
            </motion.div>
          </div>

          <div className="hidden md:flex items-center gap-8">
            <a href="#servicos" className="text-sm font-medium uppercase tracking-widest hover:text-gold transition-colors">Serviços</a>
            <a href="#galeria" className="text-sm font-medium uppercase tracking-widest hover:text-gold transition-colors">Galeria</a>
            <a href="#agendamento" className="text-sm font-medium uppercase tracking-widest hover:text-gold transition-colors">Agendar</a>
            <a href="#sobre" className="text-sm font-medium uppercase tracking-widest hover:text-gold transition-colors">Sobre</a>
            <a href="#localizacao" className="text-sm font-medium uppercase tracking-widest hover:text-gold transition-colors">Localização</a>
            
            {userRole && (
              <button 
                onClick={() => setIsDashboardView(!isDashboardView)}
                className="text-sm font-bold uppercase tracking-widest text-gold hover:text-white transition-all flex items-center gap-2 px-3 py-1 border border-gold/20 rounded-sm"
              >
                <Settings className="w-4 h-4" /> {isDashboardView ? 'Ver Site' : 'Painel'}
              </button>
            )}

            {user && (
              <button 
                onClick={handleLogout} 
                className="text-[11px] font-bold uppercase tracking-widest text-white/40 hover:text-red-400 transition-all flex items-center gap-2 group"
              >
                <LogOut className="w-4 h-4 group-hover:translate-x-1 transition-transform" /> Sair
              </button>
            )}
          </div>

          <button onClick={() => setIsMenuOpen(true)} className="md:hidden text-white">
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            className="fixed inset-0 z-[60] bg-black p-8 md:hidden"
          >
            <div className="flex justify-end">
              <button onClick={() => setIsMenuOpen(false)}><X className="w-8 h-8" /></button>
            </div>
            <div className="flex flex-col gap-6 mt-12 text-2xl font-display font-bold">
              <a href="#servicos" onClick={() => setIsMenuOpen(false)}>Serviços</a>
              <a href="#galeria" onClick={() => setIsMenuOpen(false)}>Galeria</a>
              <a href="#agendamento" onClick={() => setIsMenuOpen(false)}>Agendar</a>
              <a href="#sobre" onClick={() => setIsMenuOpen(false)}>Sobre</a>
              <a href="#localizacao" onClick={() => setIsMenuOpen(false)}>Localização</a>
              {(isAdmin || userRole === 'barber') && (
                <button 
                  onClick={() => { toggleDashboardView(true); setIsMenuOpen(false); }}
                  className="text-deep-left text-gold text-left"
                >
                  Painel de Controle
                </button>
              )}
              {user && (
                <button 
                  onClick={() => { handleLogout(); setIsMenuOpen(false); }}
                  className="text-left text-red-500/80 flex items-center gap-2 mt-4"
                >
                  <LogOut className="w-6 h-6" /> Sair da Conta
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero Section */}
      <section className="relative h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-black/60 z-10" />
          <img 
            src={siteGallery[0] || "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=2070&auto=format&fit=crop"} 
            className="w-full h-full object-cover scale-110 animate-pulse-slow"
            alt="Hero background"
          />
        </div>

        <div className="relative z-20 text-center px-6">
          <motion.img 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            src="/LOGO.png" 
            className="w-28 h-28 mx-auto mb-10 grayscale invert brightness-200 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]"
            alt="Logo"
            onError={(e: any) => e.target.style.display = 'none'}
          />
          <motion.h1 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.8 }}
            className="font-display text-6xl md:text-9xl font-black tracking-tighter mb-4 uppercase italic bg-clip-text text-transparent bg-gradient-to-b from-white to-white/50"
          >
            {siteData.name}
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-gold mb-12 max-w-xl mx-auto uppercase tracking-[0.5em] font-black text-xs md:text-sm drop-shadow-sm"
          >
            {siteData.slogan}
          </motion.p>
          <motion.div 
             initial={{ opacity: 0, scale: 0.9 }}
             animate={{ opacity: 1, scale: 1 }}
             transition={{ delay: 0.6 }}
             className="flex flex-col md:flex-row gap-5 justify-center items-center"
          >
            <a 
              href="#agendamento" 
              className="w-full md:w-auto bg-gold text-black px-12 py-5 rounded-sm font-bold uppercase tracking-[0.2em] hover:bg-gold-hover hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3 group shadow-[0_0_20px_rgba(255,215,0,0.2)]"
            >
              <Calendar className="w-5 h-5 group-hover:rotate-12 transition-transform" /> Agendar Agora
            </a>
            
            <AnimatePresence mode="popLayout">
            {!scrolled && (
              <motion.a 
                href={`https://wa.me/55${siteData.phone}`}
                target="_blank"
                initial={{ opacity: 0, y: 40, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 40, scale: 0.9 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 200, damping: 25 }}
                className="w-full md:w-auto bg-[#25D366]/5 hover:bg-[#25D366]/20 border border-[#25D366]/30 backdrop-blur-md text-[#25D366] px-12 py-5 rounded-sm font-bold uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 group relative overflow-hidden"
              >
                <div className="relative">
                  <div className="absolute inset-0 bg-[#25D366] blur-md opacity-20 group-hover:opacity-40 transition-opacity animate-pulse"></div>
                  <MessageCircle className="w-5 h-5 relative z-10 group-hover:rotate-[15deg] transition-transform" />
                </div>
                WhatsApp
              </motion.a>
            )}
            </AnimatePresence>
          </motion.div>
        </div>

        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce flex flex-col items-center gap-1 opacity-40">
           <span className="text-[10px] uppercase tracking-widest font-bold">Scroll</span>
           <div className="w-[1px] h-12 bg-white" />
        </div>
      </section>

      {/* Services Section */}
      <section id="servicos" className="bg-neutral-950">
        <div className="section-container">
          <div className="text-center mb-16">
            <h2 className="heading-secondary">Serviços</h2>
            <p className="text-white/50 max-w-md mx-auto mt-4 px-4">Cortes clássicos, modernos e barboterapia premiada no coração de Jundiaí.</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {siteServices.map((service, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="group p-8 border border-white/5 bg-white/[0.02] hover:bg-gold transition-all duration-500 rounded-sm"
              >
                <h3 className="font-display text-xl font-bold mb-2 group-hover:text-black">{service.name}</h3>
                <p className="text-gold group-hover:text-black/80 font-mono font-bold text-lg mb-4">{service.price}</p>
                <p className="text-sm text-white/40 group-hover:text-black/60 leading-relaxed italic border-l border-gold/30 pl-4 group-hover:border-black/30">
                  {service.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Gallery Section */}
      <section id="galeria" className="bg-black py-20 overflow-hidden">
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="max-w-5xl mx-auto px-6 mb-12"
        >
          <h2 className="heading-secondary">Galeria</h2>
        </motion.div>
        
        <motion.div 
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1, delay: 0.2 }}
          ref={scrollRef}
          className="galeria-scroll px-6 md:px-[calc((100vw-1024px)/2)]"
        >
          {siteGallery.filter(img => img).map((img, i) => (
            <img key={i} src={img} className="galeria-item" alt={`Trabalho ${i + 1}`} />
          ))}
        </motion.div>
        
        <motion.div 
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.8 }}
          className="mt-8 text-center text-white/20 text-xs italic tracking-widest flex items-center justify-center gap-2"
        >
          <ChevronRight className="w-3 h-3 rotate-180" />
          Arraste para o lado
          <ChevronRight className="w-3 h-3" />
        </motion.div>
      </section>

      {/* Booking Form Section */}
      <section id="agendamento" className="bg-neutral-900 border-y border-white/5 overflow-hidden">
        <div className="section-container grid md:grid-cols-2 gap-20 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <h2 className="heading-secondary">Agendar Horário</h2>
            <p className="text-white/60 mb-10 leading-relaxed text-balance">
              Preencha o formulário e reserve seu momento com um de nossos especialistas. 
              Confirmaremos sua reserva via WhatsApp em poucos minutos.
            </p>
            
            <div className="space-y-6">
              {[
                { icon: Clock, title: "Tempo médio", desc: "Cortes de 40 a 60 minutos" },
                { icon: MessageSquare, title: "Confirmação ágil", desc: "O retorno ocorre no mesmo dia" }
              ].map((item, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.4 + (i * 0.2) }}
                  className="flex gap-4"
                >
                  <div className="w-12 h-12 rounded-full bg-gold/10 flex items-center justify-center flex-shrink-0 text-gold">
                    <item.icon className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold">{item.title}</h4>
                    <p className="text-sm text-white/40">{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <form onSubmit={handleBooking} className="bg-black p-8 rounded-sm border border-white/5 space-y-8">
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-white/40 mb-3 block font-bold">1. Seus Dados</label>
                  <div className="space-y-4">
                    <input 
                      required
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                      type="text" 
                      className="w-full bg-white/5 border border-white/10 p-4 rounded-sm focus:border-gold outline-none transition-all text-sm" 
                      placeholder="Nome Completo"
                    />
                    <input 
                      required
                      value={formData.phone}
                      onChange={e => setFormData({...formData, phone: e.target.value})}
                      type="tel" 
                      className="w-full bg-white/5 border border-white/10 p-4 rounded-sm focus:border-gold outline-none transition-all text-sm" 
                      placeholder="WhatsApp (DDD + Número)"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-widest text-white/40 mb-3 block font-bold">2. Serviço</label>
                  <select 
                    value={formData.serviceType}
                    onChange={e => setFormData({...formData, serviceType: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 p-4 rounded-sm focus:border-gold outline-none transition-all text-sm h-[110px]"
                  >
                    {siteServices.map(s => <option key={s.name} value={s.name} className="bg-neutral-900">{s.name} — {s.price}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-widest text-white/40 mb-4 block font-bold">3. Escolha o Profissional</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {barbers.length > 0 ? (
                    barbers.map(b => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setFormData({...formData, barberId: b.id, barberName: b.name})}
                        className={cn(
                          "p-4 rounded-sm border transition-all text-left group relative overflow-hidden",
                          formData.barberId === b.id 
                            ? "border-gold bg-gold/10" 
                            : "border-white/10 bg-white/5 hover:border-white/30"
                        )}
                      >
                        <div className="relative z-10">
                          <User className={cn(
                            "w-5 h-5 mb-2 transition-colors",
                            formData.barberId === b.id ? "text-gold" : "text-white/40 group-hover:text-white"
                          )} />
                          <p className={cn(
                            "text-xs font-bold uppercase tracking-tight",
                            formData.barberId === b.id ? "text-white" : "text-white/60"
                          )}>{b.name}</p>
                          <p className="text-[8px] uppercase tracking-widest text-white/20">Barbeiro</p>
                        </div>
                        {formData.barberId === b.id && (
                          <motion.div 
                            layoutId="barber-select"
                            className="absolute inset-0 bg-gold/5 pointer-events-none"
                          />
                        )}
                      </button>
                    ))
                  ) : (
                    <div className="col-span-full py-12 text-center border border-dashed border-white/5 rounded-sm bg-white/5 flex flex-col items-center gap-4">
                      <div className="flex flex-col items-center gap-2">
                        <Users className="w-8 h-8 text-gold/20 animate-pulse" />
                        <p className="text-[10px] uppercase tracking-widest text-gold font-bold animate-pulse">Sincronizando profissionais...</p>
                        <p className="text-[9px] text-white/30 uppercase tracking-tight max-w-[200px]">Isso pode levar alguns segundos na primeira carga do sistema.</p>
                      </div>
                      
                      {isAdmin && (
                        <button 
                          onClick={async () => {
                            const loading = toast.loading('Sincronizando banco de dados...');
                            try {
                              const staffSnapshot = await getDocs(collection(db, 'admins'));
                              const syncPromises = staffSnapshot.docs
                                .filter(d => d.data().name !== 'Pendente')
                                .map(d => setDoc(doc(db, 'public_barbers', d.id), {
                                  name: d.data().name,
                                  photo: d.data().photo || '',
                                  id: d.id
                                }, { merge: true }));
                              await Promise.allSettled(syncPromises);
                              toast.success('Lista de profissionais inicializada!', { id: loading });
                            } catch (e) {
                              toast.error('Erro na inicialização automática', { id: loading });
                            }
                          }}
                          className="px-4 py-2 bg-gold/10 text-gold border border-gold/20 text-[9px] font-bold uppercase tracking-widest hover:bg-gold/20 transition-all rounded-sm"
                        >
                          Inicializar Lista (Admin)
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-white/5">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-white/40 mb-4 block font-bold">4. Escolha a Data</label>
                  <input 
                    required
                    value={formData.date}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={e => setFormData({...formData, date: e.target.value, time: ''})}
                    type="date" 
                    className="w-full bg-white/5 border border-white/10 p-4 rounded-sm focus:border-gold outline-none transition-all text-sm text-center" 
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-widest text-white/40 mb-4 block font-bold">5. Horários Disponíveis</label>
                  <div className="relative min-h-[120px]">
                    {!formData.date ? (
                      <div className="absolute inset-0 flex items-center justify-center border border-dashed border-white/10 rounded-sm">
                        <p className="text-[10px] uppercase tracking-widest text-white/20 font-bold">Selecione uma data primeiro</p>
                      </div>
                    ) : isBusySlotsLoading ? (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-5 h-5 border-2 border-gold border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {getAvailableSlots().length === 0 ? (
                          <div className="col-span-full py-8 text-center border border-dashed border-white/10 rounded-sm">
                            <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Barbearia fechada</p>
                          </div>
                        ) : (
                          getAvailableSlots().map(slot => {
                            const isBusy = busySlots.includes(slot);
                            return (
                              <button
                                key={slot}
                                type="button"
                                disabled={isBusy}
                                onClick={() => setFormData({...formData, time: slot})}
                                className={cn(
                                  "py-2 px-1 text-[10px] font-mono font-bold rounded-sm border transition-all relative overflow-hidden",
                                  formData.time === slot
                                    ? "bg-gold border-gold text-black shadow-[0_0_15px_rgba(255,215,0,0.3)]"
                                    : isBusy
                                      ? "bg-red-500/10 border-red-500/20 text-red-500/40 cursor-not-allowed"
                                      : "bg-white/5 border-white/10 text-white/60 hover:border-gold hover:text-gold"
                                )}
                              >
                                {slot}
                                {isBusy && (
                                  <div className="absolute inset-x-0 top-1/2 h-[1px] bg-red-500/20 -rotate-12 pointer-events-none" />
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <button 
              disabled={isLoading || isBusySlotsLoading || (!user && false) || (user && (!formData.time || !formData.barberId))}
              className="w-full bg-gold text-black py-5 rounded-sm font-bold uppercase tracking-[0.2em] hover:bg-gold-hover transition-all mt-4 disabled:opacity-30 disabled:grayscale flex items-center justify-center gap-3 group"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  PROCESSANDO...
                </>
              ) : !user ? (
                <>
                  <ShieldCheck className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  LOGIN COM GOOGLE PARA AGENDAR
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  CONFIRMAR AGENDAMENTO
                </>
              )}
            </button>
          </form>
          </motion.div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-neutral-950 py-16 px-6 overflow-hidden border-y border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-6">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="heading-secondary mb-2">Depoimentos</h2>
              <p className="text-[10px] uppercase tracking-[0.3em] text-gold/60 font-bold">O que dizem sobre nós</p>
            </motion.div>
            
            <div className="flex gap-2">
              <button 
                onClick={() => setCurrentTestimonial(prev => (prev - 1 + TESTIMONIALS.length) % TESTIMONIALS.length)}
                className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-gold hover:text-black transition-all group active:scale-95"
              >
                <ChevronLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
              </button>
              <button 
                onClick={() => setCurrentTestimonial(prev => (prev + 1) % TESTIMONIALS.length)}
                className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-gold hover:text-black transition-all group active:scale-95"
              >
                <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </div>

          <div className="relative min-h-[300px] md:min-h-[200px] flex items-center">
            <AnimatePresence mode="wait">
              <motion.div 
                key={currentTestimonial}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="w-full"
              >
                <div className="bg-white/[0.02] p-8 md:p-10 border-l-2 border-gold italic relative">
                  <MessageSquare className="absolute -top-4 -left-4 w-12 h-12 text-gold/10 -rotate-12" />
                  <p className="text-xl md:text-2xl text-white/90 leading-relaxed mb-6 font-light">
                    "{TESTIMONIALS[currentTestimonial].text}"
                  </p>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center uppercase text-sm font-black text-gold border border-white/5">
                      {TESTIMONIALS[currentTestimonial].name[0]}
                    </div>
                    <div>
                      <p className="font-bold text-base uppercase tracking-tighter text-white">{TESTIMONIALS[currentTestimonial].name}</p>
                      <p className="text-[10px] text-gold/40 uppercase tracking-[0.2em] font-bold">{TESTIMONIALS[currentTestimonial].role}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>

            <div className="absolute bottom-[-30px] left-0 flex gap-2">
              {TESTIMONIALS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentTestimonial(i)}
                  className={cn(
                    "h-1 transition-all duration-500 rounded-full",
                    currentTestimonial === i ? "w-8 bg-gold" : "w-2 bg-white/10 hover:bg-white/20"
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Opening Hours & Map Section */}
      <section id="localizacao" className="bg-black overflow-hidden py-16">
        <div className="section-container grid md:grid-cols-2 gap-12">
            <motion.div 
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              id="horarios"
            >
               <h2 className="heading-secondary mb-8">Horários</h2>
               <div className="space-y-3">
                  {OPENING_HOURS.map((h, i) => (
                    <motion.div 
                      key={i} 
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.3 + (i * 0.1) }}
                      className="flex justify-between items-center border-b border-white/5 pb-2"
                    >
                       <span className="text-white/60 font-medium text-sm">{h.day}</span>
                       <span className={cn("font-mono font-bold text-sm", h.hours === 'Fechado' ? 'text-red-500/50' : 'text-gold')}>
                        {h.hours}
                       </span>
                    </motion.div>
                  ))}
               </div>
               
               <div className="mt-10">
                  <p className="text-white/40 text-[10px] uppercase tracking-widest font-bold mb-3">📍 Localização Premium:</p>
                  <p className="font-display text-lg font-bold">{siteData.address}</p>
               </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="h-full min-h-[250px] border border-white/10 p-1 overflow-hidden rounded-sm transition-all duration-700"
            >
               <iframe
                  src={siteData.mapsEmbed}
                  className="w-full h-full min-h-[250px]"
                  style={{ border: 0 }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title="Localização da Barbearia"
               />
            </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-black py-16 px-6 border-t border-white/5 text-center">
         <div className="max-w-4xl mx-auto">
           <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12 mb-10 text-white/40">
              <a href={`https://instagram.com/${siteData.instagram}`} target="_blank" className="flex items-center gap-2 hover:text-gold transition-colors text-[11px] font-bold uppercase tracking-widest">
                <Instagram className="w-4 h-4" /> @{siteData.instagram}
              </a>
              <a href={`mailto:${siteData.email}`} className="flex items-center gap-2 hover:text-gold transition-colors text-[11px] font-bold uppercase tracking-widest">
                <Mail className="w-4 h-4" /> {siteData.email}
              </a>
              <a href={`tel:+55${siteData.phone}`} className="flex items-center gap-2 hover:text-gold transition-colors text-[11px] font-bold uppercase tracking-widest">
                <Phone className="w-4 h-4" /> {siteData.phoneDisplay}
              </a>
           </div>
           
           <p className="text-[10px] uppercase tracking-[0.4em] text-white/10 font-bold selection:bg-transparent">
             © 2025 
             <button 
               onClick={!user ? login : () => {
                 const isAuth = isAdmin || userRole === 'barber' || AUTHORIZED_EMAILS.includes(user?.email || '');
                 if (isAuth) toggleDashboardView(true);
               }}
               className="mx-1 hover:text-white transition-colors outline-none"
             >
               {siteData.name}
             </button> 
             — Todos os direitos reservados
           </p>
         </div>
      </footer>

      {/* Sticky WhatsApp Float */}
      <AnimatePresence>
        {scrolled && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5, x: 150 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.5, x: 150 }}
            transition={{ type: "spring", stiffness: 200, damping: 25 }}
            className="fixed bottom-8 right-8 z-[100] flex flex-col items-end gap-3"
          >
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-zinc-900/90 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full shadow-2xl mr-2 mb-1"
            >
              <p className="text-[10px] uppercase tracking-widest font-bold text-white/50">Fale Conosco</p>
            </motion.div>

            <motion.a
              href={`https://wa.me/55${siteData.phone}`} 
              target="_blank"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="bg-[#25D366] text-white p-4 rounded-full shadow-[0_0_30px_rgba(37,211,102,0.4)] hover:shadow-[0_0_50px_rgba(37,211,102,0.6)] transition-all flex items-center justify-center group relative h-16 w-16"
            >
              <div className="absolute inset-0 rounded-full border-4 border-white/30 animate-pulse opacity-20 scale-110"></div>
              <div className="absolute inset-0 rounded-full border border-white/20 animate-ping opacity-10"></div>
              <MessageCircle className="w-8 h-8 relative z-10 transition-transform group-hover:rotate-[15deg] group-hover:scale-110" />
            </motion.a>
          </motion.div>
        )}
      </AnimatePresence>

        </>
      ) : (
        <DashboardView 
          appointments={appointments}
          updateStatus={updateStatus}
          deleteAppointment={deleteAppointment}
          isAdmin={isAdmin}
          userRole={userRole}
          user={user}
          barbers={staff} // Pass staff state which contains full info for admins
          selectedBarberId={selectedBarberId}
          setSelectedBarberId={setSelectedBarberId}
          adminTab={adminTab}
          setAdminTab={setAdminTab}
          siteTab={siteTab}
          setSiteTab={setSiteTab}
          siteData={siteData}
          setSiteData={setSiteData}
          saveSettings={saveSettings}
          siteServices={siteServices}
          setSiteServices={setSiteServices}
          siteGallery={siteGallery}
          setSiteGallery={setSiteGallery}
          toggleUserRole={toggleUserRole}
          removeBarber={removeBarber}
          handleLogout={handleLogout}
          setIsDashboardView={toggleDashboardView}
          onSetDeletingId={setDeletingBarberId}
          dashboardDate={dashboardDate}
          setDashboardDate={setDashboardDate}
          showFullHistory={showFullHistory}
          setShowFullHistory={setShowFullHistory}
        />
      )}
    </div>
  );
}

function DashboardView({ 
  user, 
  userRole, 
  isAdmin, 
  appointments, 
  barbers, 
  adminTab, 
  setAdminTab, 
  siteTab, 
  setSiteTab, 
  siteData, 
  setSiteData, 
  siteServices, 
  setSiteServices, 
  siteGallery, 
  setSiteGallery, 
  selectedBarberId, 
  setSelectedBarberId,
  saveSettings,
  updateStatus,
  deleteAppointment,
  toggleUserRole,
  removeBarber,
  handleLogout,
  setIsDashboardView,
      onSetDeletingId,
      dashboardDate,
      setDashboardDate,
      showFullHistory,
      setShowFullHistory
    }: any) {
      const calendarMonth = useState(new Date())[0]; // Logic preserved for structure, but set via setter below
      const [currentMonth, setCurrentMonth] = useState(new Date());
    
      const daysInMonth = useMemo(() => eachDayOfInterval({
        start: startOfMonth(currentMonth),
        end: endOfMonth(currentMonth),
      }), [currentMonth]);
    
      // Appointments count per day for current month (filtered by selected barber)
      const appByDay = useMemo(() => appointments.reduce((acc: any, app: any) => {
        const isBarberMatch = selectedBarberId === 'all' || app.barberId === selectedBarberId;
        if (!isBarberMatch) return acc;
        
        const date = app.date;
        acc[date] = (acc[date] || 0) + 1;
        return acc;
      }, {}), [appointments, selectedBarberId]);
    
      const filteredAppointments = useMemo(() => appointments.filter((a: any) => {
        const isBarberMatch = selectedBarberId === 'all' || a.barberId === selectedBarberId;
        const isDateMatch = a.date === format(dashboardDate, 'yyyy-MM-dd');
        return isBarberMatch && isDateMatch;
      }), [appointments, selectedBarberId, dashboardDate]);
    
      return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black overflow-y-auto"
    >
      {/* Background Decorative Element */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-20">
         <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-gold/20 blur-[120px] rounded-full" />
         <div className="absolute top-[40%] -right-[10%] w-[30%] h-[30%] bg-gold/10 blur-[100px] rounded-full" />
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 relative z-10">
        {/* Dashboard Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6 border-b border-white/5 pb-8">
           <div className="flex items-center gap-6">
              <div className="w-16 h-16 rounded-sm bg-gold flex items-center justify-center shadow-[0_0_30px_rgba(255,215,0,0.2)] p-2 overflow-hidden">
                 {siteData.logoUrl ? (
                   <img src={siteData.logoUrl} className="w-10 h-10 object-contain brightness-0" alt="Logo" />
                 ) : (
                   <Scissors className="text-black w-8 h-8" />
                 )}
              </div>
              <div>
                <h2 className="text-3xl font-display font-bold uppercase italic tracking-tighter leading-none mb-2">
                  D'Biazzi <span className="text-gold/50 ml-2">Painel</span>
                </h2>
                <div className="flex items-center gap-3">
                  <span className="text-white/20 text-[10px] uppercase tracking-[0.3em] font-bold">Logado como</span>
                  <span className="text-gold text-[10px] uppercase font-bold tracking-widest bg-gold/10 px-2 py-0.5 rounded-sm">
                    {user?.displayName} ({userRole})
                  </span>
                </div>
              </div>
           </div>

           <div className="flex items-center gap-3 w-full md:w-auto">
              {isAdmin && (
                <button 
                  onClick={() => setShowFullHistory(!showFullHistory)}
                  className={cn(
                    "flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 text-[10px] font-bold uppercase tracking-[0.2em] rounded-sm transition-all border",
                    showFullHistory 
                       ? "bg-gold text-black border-gold shadow-[0_0_20px_rgba(255,215,0,0.3)]" 
                       : "bg-white/5 hover:bg-white/10 text-white/40 border-white/10"
                  )}
                >
                  <HistoryIcon className="w-3.5 h-3.5" /> 
                  {showFullHistory ? 'Histórico Completo' : 'Ver Recentes'}
                </button>
              )}
              <button 
                onClick={() => setIsDashboardView(false)}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 text-[10px] font-bold uppercase tracking-[0.2em] rounded-sm transition-all border border-white/10"
              >
                <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-pulse" /> Ver Site
              </button>
              <button 
                onClick={handleLogout}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-[10px] font-bold uppercase tracking-[0.2em] rounded-sm transition-all border border-red-500/10"
              >
                <LogOut className="w-4 h-4" /> Sair
              </button>
           </div>
        </header>

        {/* Dashboard Navigation */}
        <nav className="flex overflow-x-auto no-scrollbar gap-1 mb-8 md:mb-10 bg-zinc-900/50 p-1 rounded-sm border border-white/5 backdrop-blur-md">
           <button 
             onClick={() => setAdminTab('appointments')}
             className={cn(
               "flex-1 md:flex-none whitespace-nowrap px-4 md:px-8 py-3 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.2em] rounded-sm transition-all flex items-center justify-center gap-2 md:gap-3",
               adminTab === 'appointments' ? 'bg-gold text-black shadow-lg' : 'text-white/40 hover:text-white hover:bg-white/5'
             )}
           >
             <Calendar className="w-3.5 h-3.5 md:w-4 md:h-4" /> Agenda
           </button>
           {isAdmin && (
             <>
               <button 
                 onClick={() => setAdminTab('site')}
                 className={cn(
                   "flex-1 md:flex-none whitespace-nowrap px-4 md:px-8 py-3 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.2em] rounded-sm transition-all flex items-center justify-center gap-2 md:gap-3",
                   adminTab === 'site' ? 'bg-gold text-black shadow-lg' : 'text-white/40 hover:text-white hover:bg-white/5'
                 )}
               >
                 <Globe className="w-3.5 h-3.5 md:w-4 md:h-4" /> Site
               </button>
               <button 
                 onClick={() => setAdminTab('barbers')}
                 className={cn(
                   "flex-1 md:flex-none whitespace-nowrap px-4 md:px-8 py-3 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.2em] rounded-sm transition-all flex items-center justify-center gap-2 md:gap-3",
                   adminTab === 'barbers' ? 'bg-gold text-black shadow-lg' : 'text-white/40 hover:text-white hover:bg-white/5'
                 )}
               >
                 <User className="w-3.5 h-3.5 md:w-4 md:h-4" /> Equipe
               </button>
               <button 
                 onClick={() => setAdminTab('reports')}
                 className={cn(
                   "flex-1 md:flex-none whitespace-nowrap px-4 md:px-8 py-3 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.2em] rounded-sm transition-all flex items-center justify-center gap-2 md:gap-3",
                   adminTab === 'reports' ? 'bg-gold text-black shadow-lg' : 'text-white/40 hover:text-white hover:bg-white/5'
                 )}
               >
                 <BarChart3 className="w-3.5 h-3.5 md:w-4 md:h-4" /> Métricas
               </button>
             </>
           )}
        </nav>

        {/* Content Area */}
        <motion.div 
          key={adminTab}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          className="min-h-[600px]"
        >
          {/* Welcome Screen for New/Pending Barbers */}
          {!isAdmin && userRole === 'barber' && appointments.length === 0 && (
            <div className="mb-12 bg-zinc-900 border border-gold/20 p-8 rounded-sm animate-in fade-in slide-in-from-top-4 duration-700">
               <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-gold/10 rounded-full flex items-center justify-center text-gold p-2 overflow-hidden">
                     {siteData.logoUrl ? (
                       <img src={siteData.logoUrl} className="w-8 h-8 object-contain" alt="Logo" />
                     ) : (
                       <Scissors className="w-6 h-6" />
                     )}
                  </div>
                  <div>
                    <h2 className="text-xl font-display font-bold uppercase italic tracking-tight">Bem-vindo à D'Biazzi, {user?.displayName?.split(' ')[0]}!</h2>
                    <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Status: Acesso em Análise</p>
                  </div>
               </div>
               <p className="text-sm text-white/60 leading-relaxed max-w-2xl">
                 Seu acesso ao painel de barbeiro foi criado com sucesso. Por enquanto, você ainda não possui agendamentos vinculados ao seu perfil. 
                 <br /><br />
                 <span className="text-gold font-bold">Próximo passo:</span> O administrador irá confirmar sua conta e começar a direcionar clientes para você. Assim que houver agendamentos, eles aparecerão automaticamente nesta tela.
               </p>
            </div>
          )}

          {adminTab === 'appointments' && (
            <div className="grid md:grid-cols-3 gap-8 items-start">
              <div className="md:col-span-2 space-y-8">
                {/* Stats Bar */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'No Dia', val: appointments.filter((a: any) => a.date === format(dashboardDate, 'yyyy-MM-dd')).length, icon: CalendarIcon },
                    { label: 'Pendentes', val: appointments.filter((a: any) => a.status === 'pending').length, icon: Clock, color: 'text-yellow-500' },
                    { label: 'Confirmados', val: appointments.filter((a: any) => a.status === 'confirmed').length, icon: CheckCircle2, color: 'text-green-500' },
                    { label: 'Total', val: appointments.length, icon: Scissors },
                  ].map((stat, i) => (
                    <div key={i} className="bg-zinc-900/50 border border-white/5 p-4 rounded-sm flex items-center justify-between">
                       <div>
                          <p className="text-[8px] uppercase tracking-widest text-white/40 font-bold mb-1">{stat.label}</p>
                          <p className={cn("text-2xl font-display font-bold", stat.color || "text-white")}>{stat.val}</p>
                       </div>
                       <stat.icon className="w-5 h-5 text-white/10" />
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                  <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-gold flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4" /> 
                    Agenda: {format(dashboardDate, "dd 'de' MMMM", { locale: ptBR })}
                  </h3>
                  {isAdmin && (
                    <div className="flex gap-2 pb-2 overflow-x-auto">
                      <button 
                        onClick={() => setSelectedBarberId('all')}
                        className={cn(
                          "whitespace-nowrap px-4 py-2 text-[9px] uppercase font-bold tracking-[0.1em] rounded-sm border transition-all",
                          selectedBarberId === 'all' ? 'bg-gold/10 text-gold border-gold/50' : 'border-white/5 hover:border-gold/30 text-white/40'
                        )}
                      >
                        Todos
                      </button>
                      {barbers.map((b: any) => (
                        <button 
                          key={b.id}
                          onClick={() => setSelectedBarberId(b.id)}
                          className={cn(
                            "whitespace-nowrap px-4 py-2 text-[9px] uppercase font-bold tracking-[0.1em] rounded-sm border transition-all",
                            selectedBarberId === b.id ? 'bg-gold/10 text-gold border-gold/50' : 'border-white/5 hover:border-gold/30 text-white/40'
                          )}
                        >
                          {b.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid gap-4">
                  {filteredAppointments.length === 0 ? (
                    <div className="text-center py-40 bg-zinc-900/10 border border-dashed border-white/5 rounded-sm">
                      <CalendarIcon className="w-16 h-16 text-white/5 mx-auto mb-6" />
                      <p className="text-white/20 font-bold uppercase tracking-[0.5em] text-[10px]">Nenhum agendamento para este dia</p>
                    </div>
                  ) : (
                    filteredAppointments.map((app: any) => (
                      <motion.div 
                        key={app.id}
                        layout
                        className="group bg-zinc-900/40 hover:bg-zinc-900 p-6 rounded-sm border border-white/5 hover:border-gold/20 flex flex-col md:flex-row md:items-center justify-between gap-6 transition-all"
                      >
                        <div className="flex items-start gap-6">
                           <div className="relative">
                              <div className="w-14 h-14 rounded-sm bg-gold/5 border border-gold/10 overflow-hidden flex items-center justify-center flex-shrink-0">
                                {app.clientPhoto ? (
                                  <img src={app.clientPhoto} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <User className="w-7 h-7 text-gold/20" />
                                )}
                              </div>
                              <div className="absolute -top-1 -right-1 flex gap-1">
                                {app.status === 'pending' && <div className="w-3 h-3 bg-yellow-500 rounded-full border-2 border-black animate-pulse" title="AGENDADO" />}
                                {app.status === 'confirmed' && <div className="w-3 h-3 bg-green-500 rounded-full border-2 border-black" title="EM ANDAMENTO" />}
                                {app.status === 'completed' && <div className="w-3 h-3 bg-blue-500 rounded-full border-2 border-black" title="CONCLUÍDO" />}
                                {app.status === 'cancelled' && <div className="w-3 h-3 bg-red-500 rounded-full border-2 border-black" title="CANCELADO" />}
                              </div>

                           </div>
                           <div className="min-w-0">
                              <div className="flex items-center gap-3 mb-1">
                                 <h4 className="font-bold text-xl tracking-tight truncate">{app.clientName || app.name}</h4>
                              </div>
                              <p className="text-[10px] text-white/40 uppercase tracking-[0.2em] font-bold mb-3 truncate">
                                {app.clientEmail || 'E-mail não informado'}
                              </p>
                           <div className="flex flex-wrap items-center gap-4 text-[9px] font-bold uppercase tracking-widest mb-3">
                                 <span className="text-gold bg-gold/10 px-2 py-0.5 border border-gold/20">{app.serviceType || app.serviceName}</span>
                                 <div className="flex items-center gap-1.5 text-white/60"><Clock className="w-3.5 h-3.5" /> {app.time}</div>
                                 <div className={cn(
                                   "px-2 py-0.5 rounded-sm border",
                                   app.status === 'pending' ? "text-yellow-500 bg-yellow-500/10 border-yellow-500/20" :
                                   app.status === 'confirmed' ? "text-green-500 bg-green-500/10 border-green-500/20" :
                                   app.status === 'completed' ? "text-blue-500 bg-blue-500/10 border-blue-500/20" :
                                   "text-red-500 bg-red-500/10 border-red-500/20"
                                 )}>
                                   {app.status === 'pending' ? 'AGENDADO' :
                                    app.status === 'confirmed' ? 'EM ANDAMENTO' :
                                    app.status === 'completed' ? 'CONCLUÍDO' : 'CANCELADO'}
                                 </div>
                                 {isAdmin && <span className="text-white/20">@ {app.barberName}</span>}
                              </div>

                           </div>
                        </div>

                        <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
                           {app.phone && (
                             <a 
                               href={`https://wa.me/55${app.phone.replace(/\D/g, '')}`} 
                               target="_blank"
                               className="w-full md:w-auto bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366] hover:text-white px-4 md:px-6 py-3 rounded-sm text-[10px] font-bold uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-all border border-[#25D366]/20"
                             >
                               <MessageSquare className="w-3.5 h-3.5" /> WhatsApp
                             </a>
                           )}
                           <div className="flex items-center gap-2 w-full md:w-auto justify-center">
                              {app.status === 'pending' && (
                                <>
                                  <button 
                                    onClick={() => updateStatus(app.id!, 'confirmed')} 
                                    className="flex-1 md:flex-none px-4 py-3 bg-green-500 text-white rounded-sm text-[10px] font-bold uppercase tracking-widest hover:bg-green-600 transition-all shadow-lg shadow-green-500/20"
                                  >
                                    Iniciar Corte
                                  </button>
                                  <button 
                                    onClick={() => updateStatus(app.id!, 'cancelled')} 
                                    className="flex-1 md:flex-none px-4 py-3 bg-white/5 text-white/40 border border-white/10 rounded-sm text-[10px] font-bold uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all"
                                  >
                                    Cancelar
                                  </button>
                                </>
                              )}
                              {app.status === 'confirmed' && (
                                <button 
                                  onClick={() => updateStatus(app.id!, 'completed')} 
                                  className="flex-1 md:flex-none px-6 py-3 bg-blue-500 text-white rounded-sm text-[10px] font-bold uppercase tracking-widest hover:bg-blue-600 transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Concluir Corte
                                </button>
                              )}
                              {(app.status === 'completed' || app.status === 'cancelled' || isAdmin) && (
                                <button 
                                  onClick={() => deleteAppointment(app.id!)} 
                                  className="p-3 bg-transparent text-white/20 hover:bg-red-600 hover:text-white rounded-sm transition-all flex items-center justify-center border border-white/5"
                                  title="Remover Registro"
                                >
                                  <Trash2 className="w-5 h-5" />
                                </button>
                              )}
                           </div>

                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              </div>

              {/* Sidebar Calendar */}
              <div className="space-y-6">
                <div className="bg-zinc-900/50 border border-white/5 p-6 rounded-sm">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Calendário</h3>
                    <div className="flex gap-2">
                       <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1 hover:text-gold transition-colors"><ChevronLeftIcon className="w-4 h-4" /></button>
                       <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1 hover:text-gold transition-colors"><ChevronRightIcon className="w-4 h-4" /></button>
                    </div>
                  </div>
                  
                  <div className="text-center mb-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-gold">
                      {format(currentMonth, "MMMM 'de' yyyy", { locale: ptBR })}
                    </p>
                  </div>

                  <div className="grid grid-cols-7 gap-2 text-center mb-2">
                    {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((day, i) => (
                      <span key={i} className="text-[9px] font-black text-white/20">{day}</span>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {daysInMonth.map((day, i) => {
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const hasApps = appByDay[dateStr] > 0;
                      const isSelected = isSameDay(day, dashboardDate);
                      const isCurrentMonth = isSameMonth(day, calendarMonth);
                      
                      return (
                        <button
                          key={i}
                          onClick={() => setDashboardDate(day)}
                          className={cn(
                            "relative aspect-square rounded-sm text-[10px] font-bold flex items-center justify-center transition-all",
                            !isSameMonth(day, currentMonth) ? "opacity-10 cursor-default" : "cursor-pointer",
                            isSelected ? "bg-gold text-black shadow-[0_0_15px_rgba(255,215,0,0.3)]" : 
                            hasApps ? "bg-white/5 text-gold hover:bg-white/10" : "text-white/40 hover:bg-white/5 active:scale-90"
                          )}
                        >
                          {format(day, 'd')}
                          {hasApps && !isSelected && (
                            <div className="absolute top-1 right-1 w-1 h-1 bg-gold rounded-full" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <button 
                    onClick={() => {
                        setDashboardDate(startOfToday());
                        setCurrentMonth(new Date());
                    }}
                    className="w-full mt-6 py-2 border border-white/5 text-[9px] font-bold uppercase tracking-widest text-white/20 hover:text-white hover:border-gold/30 transition-all"
                  >
                    Ir para Hoje
                  </button>
                </div>

                <div className="bg-gold/5 border border-gold/10 p-6 rounded-sm">
                   <h4 className="text-[10px] font-bold uppercase tracking-widest text-gold mb-3 flex items-center gap-2">
                     <ShieldCheck className="w-4 h-4" /> Nota ao Barbeiro
                   </h4>
                   <p className="text-[10px] text-white/40 leading-relaxed uppercase tracking-tight font-bold">
                     Clique em um dia com marcador dourado no calendário para ver os horários agendados.
                   </p>
                </div>
              </div>
            </div>
          )}

          {adminTab === 'site' && isAdmin && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
               {/* Sub-tabs for Site editing */}
               <div className="flex gap-1 bg-zinc-900 p-1 rounded-sm border border-white/5 overflow-x-auto">
                  {(['geral', 'hero', 'servicos', 'sobre', 'galeria', 'contato'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setSiteTab(tab)}
                      className={cn(
                        "px-4 py-2 text-[10px] uppercase font-bold tracking-widest rounded-sm transition-all whitespace-nowrap",
                        siteTab === tab ? 'bg-gold/10 text-gold' : 'text-white/30 hover:text-white'
                      )}
                    >
                      {tab === 'geral' ? 'Informações' : 
                       tab === 'hero' ? 'Início' :
                       tab === 'servicos' ? 'Serviços' :
                       tab === 'sobre' ? 'Sobre' :
                       tab === 'galeria' ? 'Galeria' : 'Contato'}
                    </button>
                  ))}
               </div>

               <div className="bg-zinc-900/50 p-4 md:p-8 rounded-sm border border-white/5 min-h-[400px]">
                  {siteTab === 'geral' && (
                    <div className="grid md:grid-cols-2 gap-6 md:gap-8">
                       <div className="space-y-4">
                          <h3 className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-gold mb-4">Dados da Barbearia</h3>
                          <div>
                             <label className="text-[9px] uppercase tracking-widest text-white/30 mb-2 block font-bold">Nome</label>
                             <input 
                               value={siteData.name}
                               onChange={e => {
                                  const newData = {...siteData, name: e.target.value};
                                  setSiteData(newData);
                                  saveSettings({ name: e.target.value });
                               }}
                               className="w-full bg-black border border-white/10 p-3 rounded-sm focus:border-gold outline-none transition-all text-sm"
                             />
                          </div>
                          <div>
                             <label className="text-[9px] uppercase tracking-widest text-white/30 mb-2 block font-bold">WhatsApp p/ Link (Somente números)</label>
                             <input 
                               placeholder="Ex: 11999999999"
                               value={siteData.phone}
                               onChange={e => {
                                  const newData = {...siteData, phone: e.target.value};
                                  setSiteData(newData);
                                  saveSettings({ phone: e.target.value });
                               }}
                               className="w-full bg-black border border-white/10 p-3 rounded-sm focus:border-gold outline-none transition-all text-sm"
                             />
                          </div>
                          <div>
                             <label className="text-[9px] uppercase tracking-widest text-white/30 mb-2 block font-bold">WhatsApp p/ Exibição (Texto)</label>
                             <input 
                               placeholder="Ex: (11) 99999-9999"
                               value={siteData.phoneDisplay}
                               onChange={e => {
                                  const newData = {...siteData, phoneDisplay: e.target.value};
                                  setSiteData(newData);
                                  saveSettings({ phoneDisplay: e.target.value });
                               }}
                               className="w-full bg-black border border-white/10 p-3 rounded-sm focus:border-gold outline-none transition-all text-sm"
                             />
                          </div>
                          <div>
                             <label className="text-[9px] uppercase tracking-widest text-white/30 mb-2 block font-bold">E-mail</label>
                             <input 
                               value={siteData.email || ''}
                               onChange={e => {
                                  const newData = {...siteData, email: e.target.value};
                                  setSiteData(newData);
                                  saveSettings({ email: e.target.value });
                               }}
                               className="w-full bg-black border border-white/10 p-3 rounded-sm focus:border-gold outline-none transition-all text-sm"
                             />
                          </div>
                          <div>
                             <label className="text-[9px] uppercase tracking-widest text-white/30 mb-2 block font-bold">Instagram (Username sem @)</label>
                             <input 
                               value={siteData.instagram || ''}
                               onChange={e => {
                                  const newData = {...siteData, instagram: e.target.value};
                                  setSiteData(newData);
                                  saveSettings({ instagram: e.target.value });
                               }}
                               className="w-full bg-black border border-white/10 p-3 rounded-sm focus:border-gold outline-none transition-all text-sm"
                             />
                          </div>
                       </div>
                       <div className="space-y-4">
                          <div className="space-y-4 mb-8">
                             <h3 className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-gold mb-4">Logo da Barbearia</h3>
                             <ImageUploader 
                               label="Imagem do Logo"
                               aspectRatio={1 / 1}
                               initialImage={siteData.logoUrl || ''}
                               onImageCropped={(dataUrl) => {
                                  const newData = {...siteData, logoUrl: dataUrl};
                                  setSiteData(newData);
                                  saveSettings({ logoUrl: dataUrl });
                               }}
                             />
                          </div>
                          <h3 className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-gold mb-4">Endereço e Mapa</h3>
                          <div>
                             <label className="text-[9px] uppercase tracking-widest text-white/30 mb-2 block font-bold">Endereço Completo</label>
                             <textarea 
                               rows={3}
                               value={siteData.address}
                               onChange={e => {
                                  const newData = {...siteData, address: e.target.value};
                                  setSiteData(newData);
                                  saveSettings({ address: e.target.value });
                               }}
                               className="w-full bg-black border border-white/10 p-3 rounded-sm focus:border-gold outline-none transition-all text-sm"
                             />
                          </div>
                          <div>
                             <label className="text-[9px] uppercase tracking-widest text-white/30 mb-2 block font-bold">Link Embed Google Maps (src do iframe)</label>
                             <textarea 
                               rows={4}
                               value={siteData.mapsEmbed}
                               onChange={e => {
                                  const newData = {...siteData, mapsEmbed: e.target.value};
                                  setSiteData(newData);
                                  saveSettings({ mapsEmbed: e.target.value });
                               }}
                               className="w-full bg-black border border-white/10 p-3 rounded-sm focus:border-gold outline-none transition-all text-[8px] font-mono"
                             />
                             <p className="text-[8px] text-white/20 mt-1 uppercase">Vá no Google Maps &gt; Compartilhar &gt; Incorporar mapa e copie apenas o link dentro de 'src'</p>
                          </div>
                       </div>
                    </div>
                  )}

                   {siteTab === 'hero' && (
                    <div className="space-y-6">
                       <div>
                          <div className="flex justify-between items-center mb-2">
                             <label className="text-[9px] uppercase tracking-widest text-white/30 block font-bold">Slogan Principal</label>
                             <button 
                               onClick={() => saveSettings({ slogan: siteData.slogan })}
                               className="text-[9px] font-bold uppercase tracking-widest text-gold hover:text-white transition-colors"
                             >
                               Salvar Slogan
                             </button>
                          </div>
                          <input 
                            value={siteData.slogan}
                            onChange={e => {
                               const newData = {...siteData, slogan: e.target.value};
                               setSiteData(newData);
                            }}
                            className="w-full bg-black border border-white/10 p-3 rounded-sm focus:border-gold outline-none transition-all"
                          />
                       </div>
                       <div>
                          <ImageUploader 
                            label="Imagem de Fundo do Hero"
                            aspectRatio={16 / 9}
                            initialImage={siteGallery[0]}
                            onImageCropped={(dataUrl) => {
                               const newGallery = [...siteGallery];
                               newGallery[0] = dataUrl;
                               setSiteGallery(newGallery);
                               saveSettings({ galleryImages: newGallery });
                            }}
                          />
                       </div>
                    </div>
                  )}

                  {siteTab === 'servicos' && (
                    <div className="space-y-6">
                       <div className="flex justify-between items-center">
                          <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/40">Gerenciar Serviços</h3>
                          <button 
                             onClick={() => saveSettings({ services: siteServices })}
                             className="px-6 py-2 bg-gold text-black text-[9px] font-bold uppercase tracking-widest rounded-sm hover:bg-white transition-all shadow-[0_0_15px_rgba(255,215,0,0.2)]"
                          >
                             Salvar Todos os Serviços
                          </button>
                       </div>
                       {siteServices.map((s: any, i: number) => (
                         <div key={i} className="bg-black/40 p-6 rounded-sm border border-white/5 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                               <div>
                                  <label className="text-[9px] uppercase tracking-widest text-white/30 mb-1 block font-bold">Nome do Serviço</label>
                                  <input 
                                    value={s.name}
                                    onChange={e => {
                                      const newServices = [...siteServices];
                                      newServices[i] = {...s, name: e.target.value};
                                      setSiteServices(newServices);
                                    }}
                                    className="w-full bg-black border border-white/10 p-2 rounded-sm text-sm"
                                  />
                               </div>
                               <div>
                                  <label className="text-[9px] uppercase tracking-widest text-white/30 mb-1 block font-bold">Preço</label>
                                  <input 
                                    value={s.price}
                                    placeholder="Ex: 50 ou R$ 50,00"
                                    onBlur={e => {
                                      const val = e.target.value;
                                      const numMatch = val.replace(/[^\d,]/g, '').replace(',', '.').replace(/(\.)(\d*)\1/g, '$1$2');
                                      const num = parseFloat(numMatch);
                                      if (!isNaN(num)) {
                                         const normalized = `R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
                                         const newServices = [...siteServices];
                                         newServices[i] = {...s, price: normalized};
                                         setSiteServices(newServices);
                                      }
                                    }}
                                    onChange={e => {
                                      const newServices = [...siteServices];
                                      newServices[i] = {...s, price: e.target.value};
                                      setSiteServices(newServices);
                                    }}
                                    className="w-full bg-black border border-white/10 p-2 rounded-sm text-sm"
                                  />
                               </div>
                            </div>
                            <div>
                               <label className="text-[9px] uppercase tracking-widest text-white/30 mb-1 block font-bold">Descrição</label>
                               <input 
                                 value={s.description}
                                 onChange={e => {
                                   const newServices = [...siteServices];
                                   newServices[i] = {...s, description: e.target.value};
                                   setSiteServices(newServices);
                                 }}
                                 className="w-full bg-black border border-white/10 p-2 rounded-sm text-sm"
                               />
                            </div>
                         </div>
                       ))}
                    </div>
                  )}

                  {siteTab === 'sobre' && (
                     <div className="space-y-6">
                        <div>
                           <div className="flex justify-between items-center mb-2">
                             <label className="text-[9px] uppercase tracking-widest text-white/30 block font-bold">Texto Sobre Nós</label>
                             <button 
                               onClick={() => saveSettings({ about: siteData.about })}
                               className="text-[9px] font-bold uppercase tracking-widest text-gold hover:text-white transition-colors"
                             >
                               Salvar Texto
                             </button>
                           </div>
                           <textarea 
                             rows={8}
                             value={siteData.about}
                             onChange={e => {
                               const newData = {...siteData, about: e.target.value};
                               setSiteData(newData);
                             }}
                             className="w-full bg-black border border-white/10 p-4 rounded-sm focus:border-gold outline-none"
                           />
                        </div>
                        <div>
                           <div className="flex justify-between items-end mb-2">
                             <label className="text-[9px] uppercase tracking-widest text-white/30 block font-bold">Imagem Destaque (Sobre)</label>
                             {siteGallery[1] && (
                               <button 
                                 onClick={() => {
                                   const newGallery = [...siteGallery];
                                   newGallery[1] = "";
                                   setSiteGallery(newGallery);
                                   saveSettings({ galleryImages: newGallery });
                                   toast.success("Imagem removida");
                                 }}
                                 className="text-[9px] text-red-500 hover:underline uppercase tracking-widest font-bold"
                               >
                                 Remover
                               </button>
                             )}
                           </div>
                           <ImageUploader 
                             label=""
                             aspectRatio={4 / 5}
                             initialImage={siteGallery[1]}
                             onImageCropped={(dataUrl) => {
                                const newGallery = [...siteGallery];
                                newGallery[1] = dataUrl;
                                setSiteGallery(newGallery);
                                saveSettings({ galleryImages: newGallery });
                             }}
                           />
                        </div>
                     </div>
                  )}

                  {siteTab === 'galeria' && (
                    <div className="space-y-12">
                      <div className="bg-zinc-900/50 border border-white/5 p-8 rounded-sm">
                        <ImageUploader 
                          label="Adicionar Nova Foto para Galeria"
                          aspectRatio={3 / 4}
                          onImageCropped={(dataUrl) => {
                             const newGallery = [...siteGallery, dataUrl];
                             setSiteGallery(newGallery);
                             saveSettings({ galleryImages: newGallery });
                             toast.success("Foto adicionada à galeria");
                          }}
                        />
                        <p className="text-[9px] text-white/20 mt-4 uppercase tracking-[0.2em]">Dica: Use fotos verticais (3:4) para melhor resultado no carrossel</p>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-white/10 pb-4">
                          <h3 className="text-xs font-bold uppercase tracking-widest text-gold flex items-center gap-2">
                             <ImageIcon className="w-4 h-4" /> Fotos Atuais ({siteGallery.length - 2})
                          </h3>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                           {siteGallery.slice(2).length === 0 ? (
                             <div className="col-span-full py-20 text-center border border-dashed border-white/5 rounded-sm">
                               <p className="text-[10px] uppercase tracking-widest text-white/20 font-bold">Nenhuma foto na galeria além das principais</p>
                             </div>
                           ) : (
                             siteGallery.slice(2).map((img: string, i: number) => (
                               <motion.div 
                                 key={i}
                                 layout
                                 initial={{ opacity: 0, scale: 0.9 }}
                                 animate={{ opacity: 1, scale: 1 }}
                                 className="group relative aspect-[3/4] bg-black border border-white/10 rounded-sm overflow-hidden"
                               >
                                  <img src={img} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                                  <div className="absolute inset-0 bg-black/40 group-hover:bg-black/60 transition-all flex items-center justify-center p-4">
                                     <button 
                                       onClick={() => {
                                          const newGallery = siteGallery.filter((_, idx) => idx !== i+2);
                                          setSiteGallery(newGallery);
                                          saveSettings({ galleryImages: newGallery });
                                          toast.success("Foto removida");
                                       }}
                                       className="w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center hover:scale-110 transition-all shadow-xl md:opacity-0 group-hover:opacity-100"
                                       title="Remover Foto"
                                     >
                                        <Trash2 className="w-4 h-4" />
                                     </button>
                                  </div>
                               </motion.div>
                             ))
                           )}
                        </div>
                      </div>
                    </div>
                  )}

                  {siteTab === 'contato' && (
                    <div className="grid md:grid-cols-2 gap-8">
                       <div className="space-y-4">
                          <h3 className="text-xs font-bold uppercase tracking-widest text-gold">Redes Sociais</h3>
                          <div>
                             <label className="text-[9px] uppercase tracking-widest text-white/30 mb-1 block font-bold">Instagram (Sem @)</label>
                             <input 
                               value={siteData.instagram}
                               onChange={e => {
                                  const newData = {...siteData, instagram: e.target.value};
                                  setSiteData(newData);
                                  saveSettings(newData);
                               }}
                               className="w-full bg-black border border-white/10 p-3 rounded-sm focus:border-gold outline-none"
                             />
                          </div>
                       </div>
                    </div>
                  )}
               </div>
            </div>
          )}

          {adminTab === 'barbers' && isAdmin && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
               {/* Invitation Form - Only for Super Admins */}
               {AUTHORIZED_EMAILS.includes(user?.email || '') && (
                 <div className="bg-zinc-900 border border-white/5 p-6 rounded-sm flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex-1 w-full text-left">
                       <label className="text-[9px] uppercase tracking-widest text-white/30 mb-2 block font-bold">Autorizar Novo E-mail</label>
                       <input 
                         className="w-full bg-black border border-white/10 p-3 rounded-sm focus:border-gold outline-none text-white text-xs"
                         placeholder="email@exemplo.com"
                         id="invite-email"
                       />
                    </div>
                    <div className="flex gap-2 w-full md:w-auto">
                      <button 
                        onClick={async () => {
                           const el = document.getElementById('invite-email') as HTMLInputElement;
                           const email = el?.value;
                           if (!email || !email.includes('@')) {
                              toast.error('Informe um e-mail válido');
                              return;
                           }
                           
                           const q = query(collection(db, 'admins'), where('email', '==', email));
                           const exists = await getDocs(q);
                           
                           if (!exists.empty) {
                              toast.error('Este e-mail já está autorizado ou registrado.');
                              return;
                           }

                           await addDoc(collection(db, 'admins'), {
                              email: email.toLowerCase().trim(),
                              role: 'barber',
                              name: 'Pendente',
                              createdAt: serverTimestamp()
                           });
                           toast.success('E-mail autorizado!');
                           el.value = '';
                        }}
                        className="flex-1 md:flex-none px-6 py-3 bg-gold text-black text-[10px] font-bold uppercase tracking-widest hover:bg-white transition-all shadow-[0_0_20px_rgba(255,215,0,0.2)]"
                      >
                         Autorizar
                      </button>
                      <button 
                        onClick={async () => {
                          const loading = toast.loading('Sincronizando...');
                          try {
                            const staffSnapshot = await getDocs(collection(db, 'admins'));
                            const syncPromises = staffSnapshot.docs
                              .filter(d => d.data().name !== 'Pendente')
                              .map(d => setDoc(doc(db, 'public_barbers', d.id), {
                                name: d.data().name,
                                photo: d.data().photo || '',
                                id: d.id
                              }, { merge: true }));
                            await Promise.all(syncPromises);
                            toast.success('Lista pública sincronizada!', { id: loading });
                          } catch (e) {
                            toast.error('Erro na sincronização', { id: loading });
                          }
                        }}
                        className="px-6 py-3 bg-white/5 text-white/40 border border-white/10 text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 transition-all rounded-sm"
                        title="Sincronizar com lista de clientes"
                      >
                        Sincronizar
                      </button>
                    </div>
                 </div>
               )}

              <div className="grid gap-4">
                {barbers.map((b: any) => (
                  <div key={b.id} className="bg-zinc-900 p-4 md:p-6 rounded-sm border border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <div className={cn(
                          "w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center md:text-xl font-display font-bold flex-shrink-0",
                          b.role === 'admin' ? "bg-gold text-black shadow-[0_0_15px_rgba(255,215,0,0.3)]" : "bg-white/5 text-white/40"
                        )}>
                          {b.name?.[0] || 'B'}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-base md:text-lg truncate">{b.name}</h4>
                          <p className="text-[8px] md:text-[10px] text-white/30 uppercase tracking-widest font-bold truncate">{b.email}</p>
                        </div>
                    </div>
                    
                    <div className="flex items-center justify-between md:justify-end gap-3 md:gap-6 w-full md:w-auto mt-2 md:mt-0">
                        <span className={cn(
                          "text-[8px] md:text-[10px] uppercase font-bold px-2 py-0.5 md:px-3 md:py-1 rounded-sm tracking-widest",
                          b.role === 'admin' ? "bg-gold/10 text-gold border border-gold/20" : "bg-white/5 text-white/20 border border-white/10"
                        )}>
                          {b.role === 'admin' ? 'Admin' : 'Barbeiro'}
                        </span>
                        
                        <div className="flex items-center gap-2">
                          <button 
                            type="button"
                            onClick={() => toggleUserRole(b.id, b.role)}
                            className="text-[8px] md:text-[10px] font-bold uppercase tracking-widest text-gold hover:opacity-80 border border-gold/20 px-2 py-1.5 md:px-3 md:py-2 rounded-sm cursor-pointer"
                          >
                            Mudar Cargo
                          </button>
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onSetDeletingId(b.id);
                            }}
                            className="p-1.5 md:p-2 text-red-500 hover:bg-red-500/10 rounded-sm border border-red-500/20 cursor-pointer transition-colors active:scale-95"
                            title="Excluir Colaborador"
                          >
                            <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4 pointer-events-none" />
                          </button>
                        </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {adminTab === 'reports' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
               {/* Metrics Calculation */}
               {(() => {
                 const currentMonthStr = format(new Date(), 'yyyy-MM');
                 const monthlyApps = appointments.filter((a: any) => a.date.startsWith(currentMonthStr));
                 const confirmedMonthly = monthlyApps.filter((a: any) => a.status === 'confirmed');
                 
                 const getPriceValue = (app: any) => {
                   let rawPrice = app.servicePrice;
                   if (!rawPrice) {
                      const servName = app.serviceType || app.serviceName;
                      const s = siteServices.find((sv: any) => sv.name === servName);
                      rawPrice = s?.price;
                   }
                   if (!rawPrice) return 0;
                   try {
                     const cleanPrice = String(rawPrice).replace(/[^\d,.]/g, '').replace(',', '.');
                     const val = parseFloat(cleanPrice);
                     return isNaN(val) ? 0 : val;
                   } catch (e) { return 0; }
                 };

                 const monthlyTotalRevenue = confirmedMonthly.reduce((acc: number, curr: any) => acc + getPriceValue(curr), 0);

                 return (
                   <>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {[
                          { label: 'Cortes no Mês', value: monthlyApps.length, icon: Scissors },
                          { label: 'Confirmados', value: confirmedMonthly.length, icon: CheckCircle2, color: 'text-green-500' },
                          { label: userRole === 'barber' ? 'Meu Faturamento' : 'Receita Est. (Mês)', value: `R$ ${monthlyTotalRevenue.toLocaleString('pt-BR')}`, icon: TrendingUp, color: 'text-gold' },
                          { label: userRole === 'barber' ? 'Individual' : 'Total Geral', value: appointments.length, icon: BarChart3 }
                        ].map((stat, i) => (
                          <div key={i} className="bg-zinc-900 p-6 border border-white/5 rounded-sm flex items-center justify-between">
                             <div>
                                <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">{stat.label}</p>
                                <p className={cn("text-3xl font-display font-bold", stat.color || "text-white")}>{stat.value}</p>
                             </div>
                             {stat.icon && <stat.icon className="w-6 h-6 text-white/5" />}
                          </div>
                        ))}
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                      <div className="md:col-span-2 bg-zinc-900 border border-white/5 p-8 rounded-sm">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-gold mb-8 flex items-center gap-2">
                          <Clock className="w-4 h-4" /> Últimos Atendimentos (Mês)
                        </h3>
                        <div className="space-y-4">
                          {confirmedMonthly.slice(0, 10).map((app: any, i: number) => {
                            const val = getPriceValue(app);
                            return (
                              <div key={i} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                                <div>
                                  <p className="text-sm font-bold">{app.clientName || app.name}</p>
                                  <p className="text-[9px] uppercase tracking-widest text-white/30">{app.serviceType || app.serviceName} • {format(new Date(app.date), 'dd/MM')}</p>
                                </div>
                                <p className="text-sm font-mono font-bold text-gold">R$ {val.toLocaleString('pt-BR')}</p>
                              </div>
                            );
                          })}
                          {confirmedMonthly.length === 0 && (
                            <p className="text-[10px] uppercase tracking-widest text-white/20 text-center py-10">Nenhum atendimento confirmado este mês</p>
                          )}
                        </div>
                      </div>

                      <div className="bg-zinc-900 border border-white/5 p-8 rounded-sm">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-gold mb-8 flex items-center gap-2">
                          <User className="w-4 h-4" /> Performance no Mês
                        </h3>
                        <div className="space-y-6">
                           {barbers.map((b: any) => {
                             const bMonthly = confirmedMonthly.filter((a: any) => a.barberId === b.id);
                             const bTotal = bMonthly.length;
                             const bRevenue = bMonthly.reduce((acc: number, curr: any) => acc + getPriceValue(curr), 0);
                             const percent = (bTotal / Math.max(confirmedMonthly.length, 1)) * 100;
                             
                             return (
                               <div key={b.id}>
                                 <div className="flex justify-between text-[9px] uppercase font-bold tracking-widest mb-2">
                                   <span>{b.name}</span>
                                   <span className="text-gold">R$ {bRevenue.toLocaleString('pt-BR')}</span>
                                 </div>
                                 <div className="flex justify-between text-[8px] text-white/30 uppercase font-black tracking-tighter mb-2">
                                   <span>{bTotal} CORTES</span>
                                   <span>{percent.toFixed(0)}% DO TOTAL</span>
                                 </div>
                                 <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                   <motion.div 
                                     initial={{ width: 0 }}
                                     animate={{ width: `${percent}%` }}
                                     transition={{ duration: 1, ease: 'easeOut' }}
                                     className="h-full bg-gold shadow-[0_0_10px_rgba(255,215,0,0.5)]"
                                   />
                                 </div>
                               </div>
                             );
                           })}
                        </div>
                      </div>
                    </div>
                  </>
                 );
               })()}
            </div>
          )}
        </motion.div>
      </div>
      
      <button 
        onClick={() => setIsDashboardView(false)}
        className="fixed bottom-8 right-8 w-12 h-12 bg-gold text-black rounded-full flex items-center justify-center shadow-2xl hover:scale-110 transition-all z-50 md:hidden"
      >
        <ChevronRight className="w-6 h-6 rotate-180" />
      </button>
    </motion.div>
  );
}
