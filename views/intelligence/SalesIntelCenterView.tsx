import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Trash2 } from 'lucide-react';
import { getDb } from '@/services/firebase';
import { ai } from '@/services/ai/common';
import { generateContentWithRetry as executeRequest } from '@/utils/apiUtils';
import { parseFile, processData, Contact, Order } from '@/src/utils/sihParser';
import { safeJsonParse } from '@/utils/jsonUtils';
import { updateBranchInfo, localFormatFix } from '@/src/services/branchUpdateService';
import StaticUKMap from '@/src/components/common/StaticUKMap';
import InteractiveMap from '@/src/components/common/InteractiveMap';
import { GoogleGenAI } from "@google/genai";
import * as XLSX from 'xlsx';
import ReactMarkdown from 'react-markdown';
import { useAppStore } from '@/store/store';
import PrintOptionsSelector from '@/components/common/PrintOptionsSelector';
import { generateFullLeadHTML } from '@/utils/leadPrinting';
import { printContent } from '@/utils/print';
import type { Lead } from '@/types';
import BranchCallRecorderModal from '@/src/components/common/BranchCallRecorderModal';

const GOOGLE_MAPS_API_KEY = (import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY || "AIzaSyBD2ZWbkHzrCUGTHwHwqK9v2dNj6XGINTE";

interface Product {
    ref: string;
    size: string;
    pcsCrate: number;
    total: number;
    sell: number;
    isMain: boolean;
}

const initialProducts: Product[] = [
  { ref: '1a1a MA12', size: '50x25', pcsCrate: 825, total: 19, sell: 2.27, isMain: false },
  { ref: 'q100 MA12', size: '50x25', pcsCrate: 790, total: 19, sell: 2.04, isMain: true },
  { ref: 'LOM MA12', size: '50x25', pcsCrate: 710, total: 20, sell: 1.84, isMain: false },
  { ref: 'SUP MA11', size: '50x25', pcsCrate: 720, total: 19, sell: 1.84, isMain: false },
  { ref: 'Galicia MA11', size: '50x25', pcsCrate: 730, total: 19, sell: 1.78, isMain: false },
  { ref: 'Zamora 1F', size: '60x30', pcsCrate: 560, total: 16, sell: 3.10, isMain: false },
  { ref: 'MA12 Lom', size: '40x20', pcsCrate: 1350, total: 17, sell: 0.982, isMain: false },
  { ref: 'MA12 Superior', size: '40x25', pcsCrate: 900, total: 20, sell: 1.10, isMain: true },
  { ref: 'MA12 30x20', size: '60x30', pcsCrate: 1860, total: 17, sell: 0.795, isMain: false },
  { ref: 'MA12 32x22', size: '60x30', pcsCrate: 1800, total: 17, sell: 0.82, isMain: false },
];

const WeatherWidget: React.FC<{ town: string, lat?: number, lng?: number, onWeatherLoaded?: (data: any) => void }> = ({ town, lat, lng, onWeatherLoaded }) => {
    const [weather, setWeather] = useState<any>(null);

    useEffect(() => {
        const fetchWeather = async () => {
            let fetchLat = lat;
            let fetchLng = lng;
            
            if (!fetchLat || !fetchLng) {
                try {
                    const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(town)}&count=1`);
                    const geoData = await geoRes.json();
                    if (geoData.results && geoData.results.length > 0) {
                        fetchLat = geoData.results[0].latitude;
                        fetchLng = geoData.results[0].longitude;
                    } else {
                        return;
                    }
                } catch (e) {
                    return;
                }
            }
            
            try {
                const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${fetchLat}&longitude=${fetchLng}&current_weather=true`);
                const data = await res.json();
                if (data && data.current_weather) {
                    setWeather(data.current_weather);
                    if (onWeatherLoaded) onWeatherLoaded(data.current_weather);
                }
            } catch (e) {
                console.error("Weather fetch failed", e);
            }
        };

        if (town || (lat && lng)) {
            fetchWeather();
        }
    }, [town, lat, lng]);

    if (!weather) return <div className="text-xs text-text-secondary">Loading weather...</div>;

    return (
        <div className="flex items-center gap-2 text-text-primary bg-bg-secondary/50 p-2 rounded">
            <span className="text-xl">{weather.weathercode < 3 ? '☀' : weather.weathercode < 50 ? '☁' : '🌧'}</span>
            <div>
                <div className="text-sm font-bold">{weather.temperature}°C</div>
                <div className="text-[10px] text-text-secondary">Wind: {weather.windspeed} km/h</div>
            </div>
        </div>
    );
};

const SalesIntelCenterView: React.FC = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isRecordingModalOpen, setIsRecordingModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [viewMode, setViewMode] = useState<'all' | 'customers' | 'prospects'>('all');
  const [aiAdvice, setAiAdvice] = useState<{ strategy: string, error?: string } | null>(null);
  const [loadingStrategy, setLoadingStrategy] = useState(false);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [emailTone, setEmailTone] = useState<'formal' | 'professional' | 'friendly'>('formal');
  const [emailLength, setEmailLength] = useState<'short' | 'medium' | 'long'>('medium');
  const [bottomTab, setBottomTab] = useState<'notes' | 'emails'>('notes');
  const [emailInstructions, setEmailInstructions] = useState('');
  const [editableEmail, setEditableEmail] = useState<{subject: string, body: string} | null>(null);
  
  // UI States
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPriceList, setShowPriceList] = useState(false);
  const [editForm, setEditForm] = useState<Contact | null>(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [orderForm, setOrderForm] = useState<Partial<Order> | null>(null);
  const [showCallModal, setShowCallModal] = useState(false);
  const [callForm, setCallForm] = useState<{notes: string, outcome: string}>({notes: '', outcome: ''});
  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; message: string; onConfirm: () => void; isAlert?: boolean } | null>(null);
  const [showMonitor, setShowMonitor] = useState(false);
  const [showAdvancedTools, setShowAdvancedTools] = useState(false);
  const [updatingBranches, setUpdatingBranches] = useState(false);
  const [updateProgress, setUpdateProgress] = useState({ current: 0, total: 0 });
  
  // Global Report State
  const [showGlobalReportModal, setShowGlobalReportModal] = useState(false);
  const [globalReport, setGlobalReport] = useState<{ content: string, error?: string } | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  const logEvent = useAppStore(state => state.logEvent);
  const incrementApiCallCount = useAppStore(state => state.incrementApiCallCount);
  const activeSearches = useAppStore(state => state.activeSearches);
  const savedLeads = useAppStore(state => state.savedLeads);
  const handleNavigationRequest = useAppStore(state => state.handleNavigationRequest);
  const handleStructuredLeadSearch = useAppStore(state => state.handleStructuredLeadSearch);
  const showModal = useAppStore(state => state.showModal);
  const currentUser = useAppStore(state => state.currentUser);

  // ... existing imports
  
  // ... inside component
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  const handlePrintLead = useCallback(async (lead: Lead, e: React.MouseEvent) => {
      e.stopPropagation();
      const opts = await showModal({ type: 'custom', title: 'Print Options', content: <PrintOptionsSelector /> });
      if (!opts) return;
      const content = await generateFullLeadHTML(lead, `Dossier: ${lead.title}`, opts);
      printContent(content, lead.title, opts.pageSize, true, lead.market, opts.watermarkText);
  }, [showModal]);

  const allMarketLeads = useMemo(() => {
      return [...(activeSearches || []), ...(savedLeads || [])]
          .flatMap(job => (job.leads || []).map(l => ({ ...l, _jobLocation: job.location })))
          .filter(l => !l.isDismissed);
  }, [activeSearches, savedLeads]);

  const nearbyLeads = useMemo(() => {
      if (!selectedContact || !selectedContact.town) return [];
      
      const normalize = (str: string | undefined | null) => {
          if (!str) return '';
          return str.toLowerCase().replace(/[^a-z0-9]/g, '');
      };

      const townBase = (selectedContact.town || '').split(/[,(-]/)[0].trim();
      const townNorm = normalize(townBase);
      if (!townNorm) return [];
      
      const townParts = townBase.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter(p => p.length > 3);
      
      // Filter leads by town or address matching the branch's town
      let matched = allMarketLeads.filter(l => {
          const addrNorm = normalize(l.address);
          const titleNorm = normalize(l.title);
          const summaryNorm = normalize(l.summary);
          const councilNorm = normalize(l.council);
          const jobLocNorm = normalize(l._jobLocation);
          
          const matchesFull = addrNorm.includes(townNorm) || 
                 titleNorm.includes(townNorm) || 
                 summaryNorm.includes(townNorm) ||
                 councilNorm.includes(townNorm) ||
                 (jobLocNorm && jobLocNorm.includes(townNorm)) ||
                 (jobLocNorm && jobLocNorm.length > 3 && townNorm.includes(jobLocNorm));
                 
          if (matchesFull) return true;
          
          // Fallback to partial matches for multi-word towns (e.g. "St Austell" -> "austell")
          if (townParts.length > 0) {
              return townParts.some(part => 
                  addrNorm.includes(part) || 
                  titleNorm.includes(part) || 
                  summaryNorm.includes(part) ||
                  councilNorm.includes(part) ||
                  (jobLocNorm && jobLocNorm.includes(part))
              );
          }
          
          return false;
      });
      
      // Sort to prefer smaller jobs (heuristically) or just limit to top 10
      return matched.slice(0, 10);
  }, [selectedContact, allMarketLeads]);

  const showAlert = (message: string) => {
    setConfirmDialog({
      isOpen: true,
      message,
      isAlert: true,
      onConfirm: () => {}
    });
  };

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ... existing useEffects for data loading ...
  useEffect(() => {
    const db = getDb();
    const unsubscribeContacts = db.collection('contacts').onSnapshot((snapshot) => {
      const loadedContacts = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Contact));
      setContacts(loadedContacts);
      // Fallback: Save to local storage
      localStorage.setItem('contacts_backup', JSON.stringify(loadedContacts));
    }, (error) => {
        console.error("Firestore error (contacts):", error);
        // Fallback: Load from local storage
        const backup = localStorage.getItem('contacts_backup');
        if (backup) setContacts(JSON.parse(backup));
    });

    const unsubscribeOrders = db.collection('orders').onSnapshot((snapshot) => {
      const loadedOrders = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Order));
      setOrders(loadedOrders);
      localStorage.setItem('orders_backup', JSON.stringify(loadedOrders));
    }, (error) => {
        console.error("Firestore error (orders):", error);
        const backup = localStorage.getItem('orders_backup');
        if (backup) setOrders(JSON.parse(backup));
    });

    return () => {
      unsubscribeContacts();
      unsubscribeOrders();
    };
  }, []);

  // ... inside SalesIntelCenterView component

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'contacts' | 'orders') => {
    if (e.target.files && e.target.files[0]) {
      setLoading(true);
      try {
        const rawData = await parseFile(e.target.files[0]);
        // Use new unified processor
        const { contacts: newContacts, orders: newOrders } = processData(rawData);
        
        // If uploading "contacts" file (which now contains both), we process both
        // If uploading "orders" file (legacy), we might just get orders, but processData handles both if columns match
        
        const db = getDb();

        if (newContacts.length > 0) {
            const batchSize = 400;
            for (let i = 0; i < newContacts.length; i += batchSize) {
                const batch = db.batch();
                const chunk = newContacts.slice(i, i + batchSize);
                chunk.forEach(c => {
                    // Try to find existing contact
                    const existing = contacts.find(ex => 
                        (c.branchNumber && ex.branchNumber === c.branchNumber) ||
                        (ex.name === c.name && ex.town === c.town)
                    );
                    
                    if (existing) {
                        const docRef = db.collection('contacts').doc(existing.id);
                        batch.update(docRef, {
                            ...c,
                            id: existing.id,
                            notes: existing.notes || c.notes,
                            lat: existing.lat || c.lat,
                            lng: existing.lng || c.lng,
                            callRecords: existing.callRecords || c.callRecords
                        });
                    } else {
                        const docRef = db.collection('contacts').doc(); // Auto-ID
                        batch.set(docRef, { ...c, id: docRef.id });
                    }
                });
                await batch.commit();
            }
            showAlert(`Uploaded ${newContacts.length} contacts.`);
        }

        if (newOrders.length > 0) {
            const batchSize = 400;
            for (let i = 0; i < newOrders.length; i += batchSize) {
                const batch = db.batch();
                const chunk = newOrders.slice(i, i + batchSize);
                chunk.forEach(o => {
                    // Try to find existing order by ref
                    const existing = orders.find(ex => ex.ref === o.ref);
                    
                    if (existing) {
                        const docRef = db.collection('orders').doc(existing.id);
                        batch.update(docRef, {
                            ...o,
                            id: existing.id,
                            notes: existing.notes || o.notes,
                            status: existing.status || o.status
                        });
                    } else {
                        const docRef = db.collection('orders').doc(); // Auto-ID
                        batch.set(docRef, { ...o, id: docRef.id });
                    }
                });
                await batch.commit();
            }
            showAlert(`Uploaded ${newOrders.length} orders.`);
        }

      } catch (error: any) {
        console.error("Upload failed", error);
        showAlert(`Failed to upload file: ${error.message}`);
      } finally {
        setLoading(false);
      }
    }
  };

  const ordersByContactId = useMemo(() => {
      const map: Record<string, Order[]> = {};
      
      contacts.forEach(contact => {
          const contactOrders = orders.filter(o => {
              if (o.contactId === contact.id) return true;
              
              // Match by Jewson order ref against branch number or area number
              if (o.jewsonRef) {
                  const cleanJewsonRef = String(o.jewsonRef).replace(/\D/g, '');
                  if (cleanJewsonRef && cleanJewsonRef.length >= 3) {
                      // Check branchNumber
                      const cleanBranchNumber = String(contact.branchNumber || '').replace(/\D/g, '');
                      if (cleanBranchNumber && cleanJewsonRef === cleanBranchNumber) {
                          return true;
                      }
                      
                      // Check area number (e.g. "No 8")
                      const areaMatch = String(contact.area || '').match(/No\s*0*(\d+)/i);
                      if (areaMatch && areaMatch[1] === cleanJewsonRef) {
                          return true;
                      }
                      
                      // Check name for "No 8"
                      const nameMatch = String(contact.name || '').match(/No\s*0*(\d+)/i);
                      if (nameMatch && nameMatch[1] === cleanJewsonRef) {
                          return true;
                      }
                  }
              }

              // Match by postcode
              if (o.postcode && contact.postcode) {
                  const cleanOrderPostcode = String(o.postcode).replace(/\s+/g, '').toUpperCase();
                  const cleanContactPostcode = String(contact.postcode).replace(/\s+/g, '').toUpperCase();
                  
                  if (cleanOrderPostcode && cleanContactPostcode) {
                      // Exact match without spaces
                      if (cleanOrderPostcode === cleanContactPostcode) {
                          return true;
                      }
                      
                      // Match outward code (first 3-4 chars, excluding the last 3 chars which are the inward code)
                      if (cleanOrderPostcode.length >= 5 && cleanContactPostcode.length >= 5) {
                          const orderOutward = cleanOrderPostcode.substring(0, cleanOrderPostcode.length - 3);
                          const contactOutward = cleanContactPostcode.substring(0, cleanContactPostcode.length - 3);
                          if (orderOutward === contactOutward) {
                              return true;
                          }
                      } else if (cleanOrderPostcode.length >= 3 && cleanContactPostcode.startsWith(cleanOrderPostcode)) {
                          return true;
                      } else if (cleanContactPostcode.length >= 3 && cleanOrderPostcode.startsWith(cleanContactPostcode)) {
                          return true;
                      }
                  }
              }
              
              // Match by phone if available
              if (o.phone && contact.phone) {
                  let cleanOrderPhone = String(o.phone).replace(/\D/g, '');
                  let cleanContactPhone = String(contact.phone).replace(/\D/g, '');
                  
                  // Normalize UK numbers
                  if (cleanOrderPhone.startsWith('44')) cleanOrderPhone = cleanOrderPhone.substring(2);
                  if (cleanOrderPhone.startsWith('0')) cleanOrderPhone = cleanOrderPhone.substring(1);
                  
                  if (cleanContactPhone.startsWith('44')) cleanContactPhone = cleanContactPhone.substring(2);
                  if (cleanContactPhone.startsWith('0')) cleanContactPhone = cleanContactPhone.substring(1);

                  if (cleanOrderPhone && cleanContactPhone) {
                      if (cleanOrderPhone === cleanContactPhone) {
                          return true;
                      }
                      if (cleanOrderPhone.length >= 8 && cleanContactPhone.length >= 8) {
                          if (cleanOrderPhone.includes(cleanContactPhone) || cleanContactPhone.includes(cleanOrderPhone)) {
                              return true;
                          }
                      }
                  }
              }
              
              // Match by town (case insensitive)
              const orderTown = String(o.town || '').toLowerCase().trim();
              const contactTown = String(contact.town || '').toLowerCase().trim();
              const contactName = String(contact.name || '').toLowerCase().trim();
              
              if (orderTown && contactTown && orderTown === contactTown) {
                  return true;
              }
              
              // Match by branch name (case insensitive)
              if (orderTown && contactName && contactName.includes(orderTown)) {
                  return true;
              }

              // Specific abbreviation checks
              const orderTownWords = orderTown.split(/[\s,]+/);
              const orderAddress = String(o.deliveryAddress || '').toLowerCase();
              const orderPostcode = String(o.postcode || '').toUpperCase().replace(/\s+/g, '');
              
              const isOrderIOW = orderTownWords.includes('iow') || orderTownWords.includes('i.o.w') || orderTownWords.includes('i.o.w.') || 
                                 orderTown.includes('isle of wight') || orderTown.includes('isleofwight') || 
                                 orderAddress.includes('isle of wight') || orderAddress.includes(' iow ') || orderAddress.endsWith(' iow') ||
                                 (orderPostcode.startsWith('PO3') && orderPostcode.length >= 5 && parseInt(orderPostcode.substring(2, 4)) >= 30 && parseInt(orderPostcode.substring(2, 4)) <= 41);
                                 
              const isContactIOW = contactName.includes('isle of wight') || contactTown.includes('isle of wight') || 
                                   ((contactName.includes('newport') || contactTown.includes('newport')) && String(contact.postcode || '').toUpperCase().includes('PO30'));
              
              if (isOrderIOW && isContactIOW) {
                  return true;
              }

              // Fuzzy match for typos and missing spaces (e.g., "plymouth richmanwalk" vs "Plymouth Richmond Walk")
              if (orderTown && contactName) {
                  const strippedOrder = orderTown.replace(/[\s,\.]+/g, '');
                  const strippedContact = contactName.replace(/jewson/g, '').replace(/[\s,\.]+/g, '');
                  
                  if (strippedOrder && strippedContact && strippedOrder === strippedContact) {
                      return true;
                  }
                  
                  if (strippedOrder.length >= 7 && strippedContact.length >= 7) {
                      if (strippedContact.includes(strippedOrder) || strippedOrder.includes(strippedContact)) {
                          return true;
                      }
                  }

                  const orderWords = orderTown.split(/[\s,]+/).filter(w => w.length > 2);
                  if (orderWords.length >= 2) {
                      const firstWord = orderWords[0];
                      const secondWord = orderWords[1];
                      
                      if (contactTown === firstWord || contactName.includes(firstWord)) {
                          if (secondWord.length >= 4) {
                              const prefix = secondWord.substring(0, 4);
                              if (contactName.includes(prefix)) {
                                  return true;
                              }
                          }
                      }
                  }
              }
              
              return false;
          });
          
          // Sort by Date descending (newest first)
          map[contact.id] = contactOrders.sort((a, b) => {
              // Try to parse dates. If invalid, fallback to string comparison
              const dateA = new Date(a.date.split('/').reverse().join('-')); // Assuming DD/MM/YYYY
              const dateB = new Date(b.date.split('/').reverse().join('-'));
              
              if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
                  return dateB.getTime() - dateA.getTime();
              }
              
              // Fallback to order ref if dates are missing/invalid
              return String(b.ref).localeCompare(String(a.ref), undefined, { numeric: true });
          });
      });
      
      return map;
  }, [contacts, orders]);

  const getOrdersForContact = useCallback((contact: Contact) => {
      return ordersByContactId[contact.id] || [];
  }, [ordersByContactId]);

  const stats = useMemo(() => {
    let totalQty = 0;
    let customerQty = 0;
    let customersCount = 0;
    let prospectsCount = 0;
    
    contacts.forEach(c => {
        const cOrders = getOrdersForContact(c);
        const qty = cOrders.reduce((sum, o) => sum + (parseInt(o.qty) || 0), 0);
        totalQty += qty;
        
        if (cOrders.length > 0) {
            customerQty += qty;
            customersCount++;
        } else {
            prospectsCount++;
        }
    });
    
    return {
        allCount: contacts.length,
        totalQty,
        customersCount,
        customerQty,
        prospectsCount
    };
  }, [contacts, getOrdersForContact]);
  
  const getAreaNumber = (str: string) => {
    const match = String(str || '').match(/No\s*(\d+)/i);
    return match ? parseInt(match[1]) : 9999;
  };

  const filteredContacts = useMemo(() => {
    return contacts.filter(c => {
      const matchesSearch = (String(c.name || '').toLowerCase()).includes(searchTerm.toLowerCase()) || 
                            (String(c.town || '').toLowerCase()).includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;
      
      const hasOrders = getOrdersForContact(c).length > 0;
      if (viewMode === 'customers') return hasOrders;
      if (viewMode === 'prospects') return !hasOrders;
      return true;
    }).sort((a, b) => {
        // Sort by Area Number (No X)
        const areaA = getAreaNumber(a.area);
        const areaB = getAreaNumber(b.area);
        
        if (areaA !== areaB) return areaA - areaB;
        
        // Fallback to name
        return (a.name || '').localeCompare(b.name || '');
    });
  }, [contacts, searchTerm, viewMode, getOrdersForContact]);

  const handleExport = () => {
    try {
        const wb = XLSX.utils.book_new();
        const contactsSheet = XLSX.utils.json_to_sheet(contacts);
        XLSX.utils.book_append_sheet(wb, contactsSheet, "Contacts");
        const ordersSheet = XLSX.utils.json_to_sheet(orders);
        XLSX.utils.book_append_sheet(wb, ordersSheet, "Orders");
        XLSX.writeFile(wb, "Sales_Intel_Data.xlsx");
    } catch (e) {
        console.error("Export failed", e);
        showAlert("Export failed");
    }
  };

  const handleKillSwitch = async () => {
    setConfirmDialog({
      isOpen: true,
      message: "⚠️ DANGER: This will permanently delete ALL contacts and orders in the Sales Intel Center. Are you absolutely sure? This cannot be undone.",
      onConfirm: async () => {
        setLoading(true);
        try {
          const db = getDb();
          
          // Clear local state immediately
          setContacts([]);
          setOrders([]);
          setSelectedContact(null);
          localStorage.removeItem('contacts_backup');
          localStorage.removeItem('orders_backup');

          // Delete all contacts
          const contactsSnapshot = await db.collection('contacts').get();
          const contactChunks = [];
          for (let i = 0; i < contactsSnapshot.docs.length; i += 100) {
              contactChunks.push(contactsSnapshot.docs.slice(i, i + 100));
          }
          for (const chunk of contactChunks) {
              const batch = db.batch();
              chunk.forEach(doc => batch.delete(doc.ref));
              await batch.commit();
          }

          // Delete all orders
          const ordersSnapshot = await db.collection('orders').get();
          const orderChunks = [];
          for (let i = 0; i < ordersSnapshot.docs.length; i += 100) {
              orderChunks.push(ordersSnapshot.docs.slice(i, i + 100));
          }
          for (const chunk of orderChunks) {
              const batch = db.batch();
              chunk.forEach(doc => batch.delete(doc.ref));
              await batch.commit();
          }

          showAlert("All Sales Intel Center data has been permanently deleted.");
        } catch (error: any) {
          console.error("Kill switch failed", error);
          showAlert(`Failed to delete data: ${error.message}`);
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleDeleteAll = async (collectionName: 'contacts' | 'orders') => {
    setConfirmDialog({
      isOpen: true,
      message: `Are you sure you want to delete ALL ${collectionName}? This cannot be undone.`,
      onConfirm: async () => {
        setLoading(true);
        try {
          const db = getDb();
          const items = collectionName === 'contacts' ? contacts : orders;
          
          if (items.length === 0) {
              showAlert(`No ${collectionName} to delete.`);
              setLoading(false);
              return;
          }

          // Delete in smaller batches to avoid timeout/memory issues
          const batchSize = 100; 
          const chunks = [];
          for (let i = 0; i < items.length; i += batchSize) {
              chunks.push(items.slice(i, i + batchSize));
          }

          for (const chunk of chunks) {
              const batch = db.batch();
              chunk.forEach(item => {
                  const docRef = db.collection(collectionName).doc(item.id);
                  batch.delete(docRef);
              });
              // Do not await batch commit to allow offline optimistic updates
              batch.commit().catch(e => console.error("Batch commit failed in background", e));
          }
          
          // Manually clear state
          if (collectionName === 'contacts') {
              setContacts([]);
              setSelectedContact(null);
          }
          if (collectionName === 'orders') setOrders([]);
          showAlert(`All ${collectionName} deleted successfully.`);
        } catch (error: any) {
          console.error("Delete all failed", error);
          showAlert(`Failed to delete all: ${error.message}`);
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleDeleteContact = async (id: string) => {
    if (!id) {
        showAlert("Error: Invalid Contact ID");
        return;
    }
    setConfirmDialog({
      isOpen: true,
      message: "Delete this contact?",
      onConfirm: async () => {
        try {
          // Optimistic update
          setContacts(prev => prev.filter(c => c.id !== id));
          if (selectedContact?.id === id) setSelectedContact(null);
          
          const db = getDb();
          // Do not await delete to allow offline optimistic updates
          db.collection('contacts').doc(id).delete().catch(e => console.error("Delete failed in background", e));
          // showAlert("Contact deleted."); // Removed alert to make it smoother
        } catch (error: any) {
          console.error("Delete contact failed", error);
          showAlert(`Failed to delete contact: ${error.message}`);
          // Revert if failed (optional, but good practice - though complicated with onSnapshot. 
          // For now, onSnapshot should restore it if it wasn't deleted on server)
        }
      }
    });
  };

  // AI Logic
  const fetchSalesStrategy = async (contact: Contact, weatherData?: any) => {
    if (!contact.town) return;
    setLoadingStrategy(true);
    setAiAdvice(prev => prev ? { ...prev, strategy: "", error: undefined } : null);
    try {
      const weatherContext = weatherData 
        ? `Current weather: ${weatherData.temperature}C, Code: ${weatherData.weathercode}.` 
        : "Weather data unavailable.";
      
      const productContext = products.filter(p => p.isMain).map(p => p.ref).join(', ');
      const managerContext = contact.managerName ? `Manager Name: ${contact.managerName}` : "Manager Name: Unknown";
      const notesContext = contact.notes ? `Previous Notes: ${contact.notes}` : "No previous notes.";
      
      const callLogsContext = contact.callRecords && contact.callRecords.length > 0
        ? `Call Logs: ${contact.callRecords.slice(0, 5).map(c => `[${c.date}] ${c.outcome || 'No outcome'}: ${c.notes}`).join('; ')}`
        : "No previous call logs.";
        
      const contactOrders = ordersByContactId[contact.id] || [];
      const ordersContext = contactOrders.length > 0
        ? `Recent Orders: ${contactOrders.slice(0, 5).map(o => `[${o.date}] ${o.product} (Qty: ${o.qty}) - Status: ${o.status}`).join('; ')}`
        : "No recent orders.";

      // Find surrounding branches
      const surroundingBranches = contacts
        .filter(c => c.id !== contact.id && c.lat && c.lng && contact.lat && contact.lng)
        .map(c => {
            const R = 6371; // Radius of the earth in km
            const dLat = (c.lat - contact.lat) * Math.PI / 180;
            const dLon = (c.lng - contact.lng) * Math.PI / 180;
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                      Math.cos(contact.lat * Math.PI / 180) * Math.cos(c.lat * Math.PI / 180) * 
                      Math.sin(dLon/2) * Math.sin(dLon/2);
            const c_dist = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            const distance = R * c_dist; // Distance in km
            return { name: c.name, town: c.town, distance };
        })
        .filter(c => c.distance < 30) // Within 30km
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 3);
        
      const surroundingContext = surroundingBranches.length > 0 
        ? `Nearby Branches: ${surroundingBranches.map(b => `${b.name} (${b.distance.toFixed(1)}km)`).join(', ')}`
        : "No nearby branches found.";

      const localLeadsContext = nearbyLeads.length > 0 
        ? `Local Leads (Small Jobs/Projects nearby): ${nearbyLeads.map(l => `${l.title} (${l.projectStage}, ${l.projectValue})`).join('; ')}`
        : "No specific local leads identified currently.";

      const prompt = `
        You are an elite, highly professional B2B sales strategist and marketing expert assisting a sales representative in ${contact.town}, UK.
        
        Context:
        - Target Branch: ${contact.name}
        - ${managerContext}
        - ${notesContext}
        - ${callLogsContext}
        - ${ordersContext}
        - ${weatherContext}
        - ${surroundingContext}
        - ${localLeadsContext}
        - Main Products to push: ${productContext}
        
        Task:
        1. Search the internet for recent local news, construction projects, or economic developments in ${contact.town}.
        2. Search the internet for any information regarding ${contact.name}, the size/scale of this specific depot, or news about ${contact.managerName}.
        3. Based on the weather, local news, depot size, surrounding branches, AND the Local Leads provided, formulate a strategic sales approach. How can we leverage the surrounding branches and these specific local projects to create a regional strategy?
        
        CRITICAL INSTRUCTIONS:
        - DO NOT mention any negative issues, problems, complaints, or internal challenges in the strategy or tips. Keep everything strictly positive and forward-looking.
        
        Return a JSON object with the following structure:
        {
          "strategy": "Your detailed sales strategy, including regional tactics with nearby branches, depot size insights, and conversation starters based on local news and local leads. NO NEGATIVE ISSUES."
        }
        Only return the JSON object, no markdown formatting.
      `;

      const response = await executeRequest(ai, {
        model: "gemini-3.1-pro-preview",
        contents: prompt,
        config: { 
            tools: [{ googleSearch: {} }],
            responseMimeType: "application/json"
        }
      });
      
      let text = response.text || '{}';
      const parsed = safeJsonParse(text, { strategy: "No strategy generated." });
      
      setAiAdvice(prev => ({
          strategy: parsed.strategy || "No strategy generated.",
          error: undefined
      }));
      logEvent('SYS', `Generated AI Sales Strategy for ${contact.name}`);
    } catch (error: any) {
      console.error("AI fetch failed", error);
      logEvent('ERR', `AI Strategy fetch failed: ${error.message}`);
      if (error.message?.includes('429') || error.message?.includes('Quota') || error.status === 429) {
          setAiAdvice(prev => ({ strategy: "", error: "⚠️ AI Service Quota Exceeded. Please try again later." }));
      } else {
          setAiAdvice(prev => ({ strategy: "", error: "Could not generate sales strategy. " + (error.message || "") }));
      }
    } finally {
      setLoadingStrategy(false);
    }
  };

  const generateEmailDraft = async (contact: Contact, tone: string = emailTone, length: string = emailLength, instructions: string = emailInstructions) => {
    if (!contact.town) return;
    setLoadingEmail(true);
    try {
      const productContext = products.filter(p => p.isMain).map(p => p.ref).join(', ');
      const managerContext = contact.managerName ? `Manager Name: ${contact.managerName}` : "Manager Name: Unknown";
      const notesContext = contact.notes ? `Previous Notes: ${contact.notes}` : "No previous notes.";
      
      const callLogsContext = contact.callRecords && contact.callRecords.length > 0
        ? `Call Logs: ${contact.callRecords.slice(0, 5).map(c => `[${c.date}] ${c.outcome || 'No outcome'}: ${c.notes}`).join('; ')}`
        : "No previous call logs.";
        
      const contactOrders = ordersByContactId[contact.id] || [];
      const ordersContext = contactOrders.length > 0
        ? `Recent Orders: ${contactOrders.slice(0, 5).map(o => `[${o.date}] ${o.product} (Qty: ${o.qty}) - Status: ${o.status}`).join('; ')}`
        : "No recent orders.";

      const existingStrategyContext = aiAdvice?.strategy ? `Existing AI Strategy for this branch: ${aiAdvice.strategy}` : "No specific AI strategy generated yet.";

      const prompt = `
        You are an elite, highly professional B2B sales strategist and marketing expert writing an email to a branch manager in ${contact.town}, UK.
        
        Context:
        - Target Branch: ${contact.name}
        - ${managerContext}
        - ${notesContext}
        - ${callLogsContext}
        - ${ordersContext}
        - Main Products to push: ${productContext}
        - ${existingStrategyContext}
        
        Task:
        Draft a B2B marketing email to the branch manager (if known, otherwise generic). The email must not sound like a generic template; it should be tailored, value-driven, and focused on building a strong partnership. Use the provided context and strategy (if any) to inform the content.
        
        CRITICAL INSTRUCTIONS:
        - DO NOT mention any negative issues, problems, complaints, or internal challenges in the draft email. Keep everything strictly positive and forward-looking.
        - The email tone should be: ${tone}.
        - The email length should be: ${length}.
        - SIGNATURE REQUIREMENT: You MUST include the website link "www.montazul.com" in the email signature. This is non-negotiable.
        - The email MUST be addressed to the manager by name (${contact.managerName || 'Branch Manager'}).
        ${instructions ? `- USER'S SPECIFIC INSTRUCTIONS FOR THE EMAIL: "${instructions}". You MUST incorporate these instructions into the email draft. If the instructions are short and direct (e.g., "manager unavailable, call tomorrow"), make the email extremely concise and focused ONLY on that message, avoiding unnecessary fluff.` : ''}
        
        Return a JSON object with the following structure:
        {
          "emailSubject": "Compelling email subject",
          "emailBody": "The tailored B2B draft email addressing the manager, following the requested tone (${tone}) and length (${length}). NO NEGATIVE ISSUES."
        }
        Only return the JSON object, no markdown formatting.
      `;

      const response = await executeRequest(ai, {
        model: "gemini-3.1-pro-preview",
        contents: prompt,
        config: {
            responseMimeType: "application/json"
        }
      });
      
      let text = response.text || '{}';
      const parsed = safeJsonParse(text, { emailSubject: "Follow up", emailBody: "No email body generated." });
      
      let finalBody = parsed.emailBody || "No email body generated.";
      if (!finalBody.toLowerCase().includes('montazul.com')) {
          finalBody += "\n\n--\nMont Azul\nwww.montazul.com";
      }
      
      setEditableEmail({
          subject: parsed.emailSubject || "Follow up",
          body: finalBody
      });
      
      logEvent('SYS', `Generated AI Email Draft for ${contact.name}`);
    } catch (error: any) {
      console.error("AI email draft failed", error);
      logEvent('ERR', `AI Email Draft fetch failed: ${error.message}`);
      showAlert("Failed to generate email draft. " + (error.message || ""));
    } finally {
      setLoadingEmail(false);
    }
  };

  useEffect(() => {
    if (selectedContact) {
        // Reset AI advice when contact changes
        setAiAdvice(null);
    }
  }, [selectedContact?.id]);

  const handleSaveContact = async () => {
      if (!editForm || !editForm.id) return;
      const db = getDb();
      await db.collection('contacts').doc(editForm.id).update({ ...editForm });
      setSelectedContact(editForm);
      setShowEditModal(false);
  };

  const handleSendEmail = async () => {
      if (!selectedContact || !editableEmail) return;
      
      const timestamp = new Date().toLocaleDateString();
      const newEmail = {
          id: Date.now().toString(),
          date: timestamp,
          subject: editableEmail.subject,
          body: editableEmail.body,
          status: 'sent' as const
      };
      
      const emailRecord = `[${timestamp} Email Draft Sent]\nSubject: ${editableEmail.subject}\n\n${editableEmail.body}`;
      
      const updatedNotes = selectedContact.notes 
          ? `${selectedContact.notes}\n\n${emailRecord}` 
          : emailRecord;
          
      const updatedEmails = [...(selectedContact.emails || []), newEmail];
          
      const updatedContact = { ...selectedContact, notes: updatedNotes, emails: updatedEmails };
      setSelectedContact(updatedContact);
      
      try {
          const db = getDb();
          await db.collection('contacts').doc(selectedContact.id).update({ notes: updatedNotes, emails: updatedEmails });
          logEvent('SYS', `Saved email draft to notes and history for ${selectedContact.name}`);
      } catch (error) {
          console.error("Failed to save email to notes", error);
      }
      
      const mailtoLink = `mailto:${selectedContact.email || ''}?subject=${encodeURIComponent(editableEmail.subject)}&body=${encodeURIComponent(editableEmail.body)}`;
      window.location.href = mailtoLink;
  };

  const handleMarkEmailSent = async () => {
      if (!selectedContact || !editableEmail) return;
      
      const timestamp = new Date().toLocaleDateString();
      const newEmail = {
          id: Date.now().toString(),
          date: timestamp,
          subject: editableEmail.subject,
          body: editableEmail.body,
          status: 'sent' as const
      };
      
      const emailRecord = `[${timestamp} Email Marked Sent]\nSubject: ${editableEmail.subject}\n\n${editableEmail.body}`;
      
      const updatedNotes = selectedContact.notes 
          ? `${selectedContact.notes}\n\n${emailRecord}` 
          : emailRecord;
          
      const updatedEmails = [...(selectedContact.emails || []), newEmail];
          
      const updatedContact = { ...selectedContact, notes: updatedNotes, emails: updatedEmails };
      setSelectedContact(updatedContact);
      
      try {
          const db = getDb();
          await db.collection('contacts').doc(selectedContact.id).update({ notes: updatedNotes, emails: updatedEmails });
          logEvent('SYS', `Marked email as sent for ${selectedContact.name}`);
          showAlert("Email marked as sent and saved to history.");
          setEditableEmail(null);
      } catch (error) {
          console.error("Failed to save email to notes", error);
          showAlert("Failed to save email.");
      }
  };

  const handleDiscardDraft = () => {
      setEditableEmail(null);
  };

  const handleWriteManually = () => {
      setEditableEmail({
          subject: '',
          body: `\n\n--\nMont Azul\nwww.montazul.com`
      });
  };

  const handleDeleteEmail = async (emailId: string) => {
      if (!selectedContact) return;
      
      const updatedEmails = (selectedContact.emails || []).filter(e => e.id !== emailId);
      const updatedContact = { ...selectedContact, emails: updatedEmails };
      setSelectedContact(updatedContact);
      
      try {
          const db = getDb();
          await db.collection('contacts').doc(selectedContact.id).update({ emails: updatedEmails });
          logEvent('SYS', `Deleted email from history for ${selectedContact.name}`);
      } catch (error) {
          console.error("Failed to delete email", error);
          showAlert("Failed to delete email from history.");
      }
  };

  const handleMarkLeadSent = async (leadId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!selectedContact || !selectedContact.id) return;
      
      const db = getDb();
      const currentSent = selectedContact.sentLeads || [];
      
      let newSent;
      if (currentSent.includes(leadId)) {
          newSent = currentSent.filter(id => id !== leadId);
      } else {
          newSent = [...currentSent, leadId];
      }
      
      try {
          await db.collection('contacts').doc(selectedContact.id).update({ sentLeads: newSent });
          setSelectedContact({ ...selectedContact, sentLeads: newSent });
          setContacts(prev => prev.map(c => c.id === selectedContact.id ? { ...c, sentLeads: newSent } : c));
      } catch (err) {
          console.error("Failed to mark lead as sent", err);
          showAlert("Failed to update lead status.");
      }
  };

  const handleGenerateGlobalReport = async () => {
      setGeneratingReport(true);
      setShowGlobalReportModal(true);
      setGlobalReport(null);
      
      try {
          // Aggregate data for the prompt (keep it concise to save tokens)
          const totalBranches = contacts.length;
          const totalOrders = orders.length;
          const totalQty = stats.totalQty;
          
          // Top 5 branches by order volume
          const branchVolumes = contacts.map(c => {
              const cOrders = getOrdersForContact(c);
              const qty = cOrders.reduce((sum, o) => sum + (parseInt(o.qty) || 0), 0);
              return { name: c.name, town: c.town, qty, orderCount: cOrders.length };
          }).sort((a, b) => b.qty - a.qty).slice(0, 5);
          
          // Recent calls
          const recentCalls = contacts.flatMap(c => 
              (c.callRecords || []).map(r => ({ branch: c.name, date: r.date, outcome: r.outcome, notes: r.notes }))
          ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10);
          
          const prompt = `
            You are an elite B2B sales strategist for a building materials supplier in the UK.
            Analyze the following aggregated sales data and current UK construction market trends to generate a strategic "National Strategy Report".
            
            Data Summary:
            - Total Branches Monitored: ${totalBranches}
            - Total Orders: ${totalOrders}
            - Total Quantity Sold: ${totalQty}
            
            Top 5 Branches by Volume:
            ${branchVolumes.map(b => `- ${b.name} (${b.town}): ${b.qty} units across ${b.orderCount} orders`).join('\n')}
            
            Recent Call Outcomes (Last 10):
            ${recentCalls.map(c => `- ${c.branch} (${new Date(c.date).toLocaleDateString()}): ${c.outcome} - ${c.notes}`).join('\n')}
            
            Task:
            1. Search the internet for the current state of the UK construction industry (e.g., housing market, infrastructure projects, material shortages).
            2. Based on the provided data and your search, provide a comprehensive strategic report.
            3. The report should include:
               - Executive Summary
               - Market Overview (UK Construction)
               - Internal Performance Analysis (based on the data provided)
               - Strategic Recommendations (which regions/branches to target, how to improve outreach, what products to push).
               
            Format the output in clean, professional Markdown.
          `;

          const response = await executeRequest(ai, {
              model: "gemini-3.1-pro-preview",
              contents: prompt,
              config: { 
                  tools: [{ googleSearch: {} }]
              }
          });
          
          setGlobalReport({ content: response.text || 'No report generated.' });
          logEvent('SYS', 'Generated National Strategy Report');
      } catch (error: any) {
          console.error("Global report generation failed", error);
          setGlobalReport({ content: "", error: "Failed to generate report: " + error.message });
      } finally {
          setGeneratingReport(false);
      }
  };

  const handleSaveOrder = async () => {
      if (!orderForm || !selectedContact) return;
      const db = getDb();
      
      if (orderForm.id) {
          // Update
          await db.collection('orders').doc(orderForm.id).update({ ...orderForm });
      } else {
          // Create
          const newOrder = {
              ...orderForm,
              town: selectedContact.town,
              contactId: selectedContact.id,
              date: orderForm.date || new Date().toISOString().split('T')[0],
              status: orderForm.status || 'Pending',
              qty: orderForm.qty || '1',
              ref: orderForm.ref || `ORD-${Date.now()}`
          };
          await db.collection('orders').add(newOrder);
      }
      setShowOrderModal(false);
      setOrderForm(null);
  };

  const handleDeleteOrder = async (id: string) => {
      setConfirmDialog({
          isOpen: true,
          message: "Delete this order?",
          onConfirm: async () => {
              const db = getDb();
              await db.collection('orders').doc(id).delete().catch(e => console.error("Failed to delete order", e));
          }
      });
  };

  const handleSaveNote = async () => {
      if (!selectedContact || !selectedContact.id) return;
      const timestamp = new Date().toLocaleString();
      const updatedNote = `${selectedContact.notes || ''}\n[Saved: ${timestamp}]`;
      const db = getDb();
      await db.collection('contacts').doc(selectedContact.id).update({ notes: updatedNote });
      setSelectedContact({ ...selectedContact, notes: updatedNote });
  };

  const handleAddCallRecord = async (contactId: string, notes: string, outcome: string) => {
      const db = getDb();
      const contact = contacts.find(c => c.id === contactId);
      if (!contact) return;

      const newRecord = {
          id: Date.now().toString(),
          date: new Date().toISOString(),
          notes,
          outcome
      };

      const updatedRecords = [...(contact.callRecords || []), newRecord];
      
      await db.collection('contacts').doc(contactId).update({ callRecords: updatedRecords });
      
      if (selectedContact?.id === contactId) {
          setSelectedContact({ ...selectedContact, callRecords: updatedRecords });
      }
  };

  const handleDeleteCallRecord = async (contactId: string, recordId: string) => {
      setConfirmDialog({
          isOpen: true,
          message: "Delete this call record?",
          onConfirm: async () => {
              const db = getDb();
              const contact = contacts.find(c => c.id === contactId);
              if (!contact) return;
              const updatedRecords = (contact.callRecords || []).filter(r => r.id !== recordId);
              await db.collection('contacts').doc(contactId).update({ callRecords: updatedRecords });
              if (selectedContact?.id === contactId) {
                  setSelectedContact({ ...selectedContact, callRecords: updatedRecords });
              }
          }
      });
  };

  const handleUpdateBranch = async (contact: Contact) => {
      setUpdatingBranches(true);
      setUpdateProgress({ current: 0, total: 1 });
      try {
          const updated = await updateBranchInfo([contact]);
          if (updated.length > 0) {
              const db = getDb();
              await db.collection('contacts').doc(contact.id).update({ ...updated[0] });
              if (selectedContact?.id === contact.id) {
                  setSelectedContact(updated[0]);
              }
              showAlert(`Successfully updated information for ${contact.name}.`);
          }
      } catch (error: any) {
          showAlert(`Failed to update branch: ${error.message}`);
      } finally {
          setUpdatingBranches(false);
      }
  };

  const handleBulkUpdateBranches = async () => {
      if (filteredContacts.length === 0) return;
      
      setConfirmDialog({
          isOpen: true,
          message: `Are you sure you want to run an AI update on ${filteredContacts.length} branches? This may take a while.`,
          onConfirm: async () => {
              setUpdatingBranches(true);
              setUpdateProgress({ current: 0, total: filteredContacts.length });
              try {
                  const updated = await updateBranchInfo(filteredContacts, (current, total) => {
                      setUpdateProgress({ current, total });
                  });
                  
                  if (updated.length > 0) {
                      const db = getDb();
                      const batchSize = 400;
                      for (let i = 0; i < updated.length; i += batchSize) {
                          const batch = db.batch();
                          const chunk = updated.slice(i, i + batchSize);
                          chunk.forEach(c => {
                              const docRef = db.collection('contacts').doc(c.id);
                              batch.update(docRef, { ...c });
                          });
                          await batch.commit();
                      }
                      showAlert(`Successfully updated information for ${updated.length} branches.`);
                  }
              } catch (error: any) {
                  showAlert(`Failed to bulk update branches: ${error.message}`);
              } finally {
                  setUpdatingBranches(false);
              }
          }
      });
  };

  const handleFastFormatFix = async () => {
      if (filteredContacts.length === 0) return;
      
      setConfirmDialog({
          isOpen: true,
          message: `Are you sure you want to run a fast local format fix on ${filteredContacts.length} branches? This uses NO API calls and will instantly move misplaced mobile numbers to the correct column.`,
          onConfirm: async () => {
              setUpdatingBranches(true);
              try {
                  const updated = localFormatFix(filteredContacts);
                  
                  if (updated.length > 0) {
                      const db = getDb();
                      const batchSize = 400;
                      for (let i = 0; i < updated.length; i += batchSize) {
                          const batch = db.batch();
                          const chunk = updated.slice(i, i + batchSize);
                          chunk.forEach(c => {
                              const docRef = db.collection('contacts').doc(c.id);
                              batch.update(docRef, { ...c });
                          });
                          await batch.commit();
                      }
                      showAlert(`Successfully fixed formatting for ${updated.length} branches.`);
                  }
              } catch (error: any) {
                  showAlert(`Failed to run fast format fix: ${error.message}`);
              } finally {
                  setUpdatingBranches(false);
              }
          }
      });
  };

  const mapMarkers = React.useMemo(() => {
      if (selectedContact) {
          const isCustomer = getOrdersForContact(selectedContact).length > 0;
          const hasCalls = (selectedContact.callRecords || []).length > 0;
          return [{ 
              id: selectedContact.id,
              lat: selectedContact.lat || 0, 
              lng: selectedContact.lng || 0, 
              title: `${selectedContact.name}\n${selectedContact.town}`, 
              color: isCustomer ? '#10b981' : (hasCalls ? '#3b82f6' : '#ef4444'), 
              address: selectedContact.address || selectedContact.town,
              icon: hasCalls ? '📞' : undefined
          }];
      }
      return filteredContacts.map(c => {
          const isCustomer = getOrdersForContact(c).length > 0;
          const hasCalls = (c.callRecords || []).length > 0;
          return { 
              id: c.id,
              lat: c.lat || 0, 
              lng: c.lng || 0, 
              title: `${c.name}\n${c.town}`, 
              color: isCustomer ? '#10b981' : (hasCalls ? '#3b82f6' : '#ef4444'), 
              address: c.address || c.town,
              icon: hasCalls ? '📞' : undefined
          };
      });
  }, [filteredContacts, selectedContact, ordersByContactId]);

  return (
    <div className="flex h-full w-full bg-bg-primary text-text-primary overflow-hidden font-sans relative">
      
      {/* Confirm Dialog */}
      {confirmDialog?.isOpen && (
        <div className="absolute inset-0 z-[60] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-bg-secondary rounded-xl border border-border-color p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold text-text-primary mb-4">{confirmDialog.isAlert ? 'Alert' : 'Confirm Action'}</h2>
            <p className="text-text-primary mb-6">{confirmDialog.message}</p>
            <div className="flex justify-end gap-3">
              {!confirmDialog.isAlert && (
                <button 
                  onClick={() => setConfirmDialog(null)}
                  className="btn tertiary"
                >
                  Cancel
                </button>
              )}
              <button 
                onClick={() => {
                  confirmDialog.onConfirm();
                  setConfirmDialog(null);
                }}
                className={`px-4 py-2 rounded text-text-primary text-sm font-bold shadow-lg ${confirmDialog.isAlert ? 'bg-primary hover:brightness-110 shadow-primary/50' : 'bg-loss-color hover:brightness-110 shadow-loss-color/50'}`}
              >
                {confirmDialog.isAlert ? 'OK' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editForm && (
          <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
              <div className="bg-bg-secondary rounded-xl border border-border-color p-6 w-full max-w-2xl shadow-2xl">
                  <h2 className="text-xl font-bold text-text-primary mb-4">Edit Contact Details</h2>
                  <div className="grid grid-cols-2 gap-4">
                      <div><label className="text-xs text-text-secondary">Branch Name</label><input className="w-full bg-bg-primary border border-border-color rounded p-2" value={editForm.name || ''} onChange={e => setEditForm({...editForm, name: e.target.value})} /></div>
                      <div><label className="text-xs text-text-secondary">Manager</label><input className="w-full bg-bg-primary border border-border-color rounded p-2" value={editForm.managerName || ''} onChange={e => setEditForm({...editForm, managerName: e.target.value})} /></div>
                      <div><label className="text-xs text-text-secondary">Email</label><input className="w-full bg-bg-primary border border-border-color rounded p-2" value={editForm.email || ''} onChange={e => setEditForm({...editForm, email: e.target.value})} /></div>
                      <div><label className="text-xs text-text-secondary">Phone</label><input className="w-full bg-bg-primary border border-border-color rounded p-2" value={editForm.phone || ''} onChange={e => setEditForm({...editForm, phone: e.target.value})} /></div>
                      <div><label className="text-xs text-text-secondary">Mobile</label><input className="w-full bg-bg-primary border border-border-color rounded p-2" value={editForm.mobile || ''} onChange={e => setEditForm({...editForm, mobile: e.target.value})} /></div>
                      <div><label className="text-xs text-text-secondary">Landline</label><input className="w-full bg-bg-primary border border-border-color rounded p-2" value={editForm.landline || ''} onChange={e => setEditForm({...editForm, landline: e.target.value})} /></div>
                      <div className="col-span-2"><label className="text-xs text-text-secondary">Address</label><input className="w-full bg-bg-primary border border-border-color rounded p-2" value={editForm.address || ''} onChange={e => setEditForm({...editForm, address: e.target.value})} /></div>
                  </div>
                  <div className="flex justify-end gap-2 mt-6">
                      <button onClick={() => setShowEditModal(false)} className="btn tertiary">Cancel</button>
                      <button onClick={handleSaveContact} className="btn">Save Changes</button>
                  </div>
              </div>
          </div>
      )}

      {/* Order Modal */}
      {showOrderModal && orderForm && (
          <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
              <div className="bg-bg-secondary rounded-xl border border-border-color p-6 w-full max-w-md shadow-2xl">
                  <h2 className="text-xl font-bold text-text-primary mb-4">{orderForm.id ? 'Edit Load' : 'Add Load'}</h2>
                  <div className="space-y-4">
                      <div>
                          <label className="text-xs text-text-secondary">Order Ref</label>
                          <input className="w-full bg-bg-primary border border-border-color rounded p-2" value={orderForm.ref || ''} onChange={e => setOrderForm({...orderForm, ref: e.target.value})} placeholder="e.g. ORD-123" />
                      </div>
                      <div>
                          <label className="text-xs text-text-secondary">Product / Contains</label>
                          <input className="w-full bg-bg-primary border border-border-color rounded p-2" value={orderForm.product || ''} onChange={e => setOrderForm({...orderForm, product: e.target.value})} placeholder="e.g. 18+2 LB" />
                      </div>
                      <div>
                          <label className="text-xs text-text-secondary">Date</label>
                          <input type="date" className="w-full bg-bg-primary border border-border-color rounded p-2" value={orderForm.date || ''} onChange={e => setOrderForm({...orderForm, date: e.target.value})} />
                      </div>
                      <div>
                          <label className="text-xs text-text-secondary">Status</label>
                          <select className="w-full bg-bg-primary border border-border-color rounded p-2" value={orderForm.status || 'Pending'} onChange={e => setOrderForm({...orderForm, status: e.target.value as any})}>
                              <option value="Pending">Pending</option>
                              <option value="Shipping">Shipping</option>
                              <option value="In Transit">In Transit</option>
                              <option value="Delivered">Delivered</option>
                          </select>
                      </div>
                      <div>
                          <label className="text-xs text-text-secondary">Quantity</label>
                          <input className="w-full bg-bg-primary border border-border-color rounded p-2" value={orderForm.qty || '1'} onChange={e => setOrderForm({...orderForm, qty: e.target.value})} />
                      </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-6">
                      <button onClick={() => setShowOrderModal(false)} className="btn tertiary">Cancel</button>
                      <button onClick={handleSaveOrder} className="btn">Save Load</button>
                  </div>
              </div>
          </div>
      )}

      {/* Call Modal */}
      {showCallModal && selectedContact && (
          <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
              <div className="bg-bg-secondary rounded-xl border border-border-color p-6 w-full max-w-md shadow-2xl">
                  <h2 className="text-xl font-bold text-text-primary mb-4">Log Call</h2>
                  <div className="space-y-4">
                      <div>
                          <label className="text-xs text-text-secondary">Outcome</label>
                          <select className="w-full bg-bg-primary border border-border-color rounded p-2 text-text-primary" value={callForm.outcome || 'Interested'} onChange={e => setCallForm({...callForm, outcome: e.target.value})}>
                              <option value="Interested">Interested</option>
                              <option value="Not Interested">Not Interested</option>
                              <option value="Call Back Later">Call Back Later</option>
                              <option value="No Answer">No Answer</option>
                              <option value="Left Voicemail">Left Voicemail</option>
                          </select>
                      </div>
                      <div>
                          <label className="text-xs text-text-secondary">Notes</label>
                          <textarea 
                              className="w-full bg-bg-primary border border-border-color rounded p-2 text-text-primary h-32" 
                              value={callForm.notes || ''} 
                              onChange={e => setCallForm({...callForm, notes: e.target.value})} 
                              placeholder="Enter call notes..." 
                          />
                      </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-6">
                      <button onClick={() => setShowCallModal(false)} className="btn tertiary">Cancel</button>
                      <button onClick={() => {
                          handleAddCallRecord(selectedContact.id, callForm.notes, callForm.outcome);
                          setShowCallModal(false);
                      }} className="btn">Save Call</button>
                  </div>
              </div>
          </div>
      )}

      {/* Price List Modal */}
      {showPriceList && (
          <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
              <div className="bg-bg-secondary rounded-xl border border-border-color p-6 w-full max-w-4xl shadow-2xl h-[80vh] flex flex-col">
                  <div className="flex justify-between items-center mb-4">
                      <h2 className="text-xl font-bold text-text-primary">Product Price List 2026</h2>
                      <button onClick={() => setShowPriceList(false)} className="text-text-secondary hover:text-text-primary">✕</button>
                  </div>
                  <div className="flex-1 overflow-auto">
                      <table className="w-full text-sm text-left text-text-primary">
                          <thead className="text-xs text-text-secondary uppercase bg-bg-primary sticky top-0">
                              <tr>
                                  <th className="px-4 py-2">Ref</th>
                                  <th className="px-4 py-2">Size</th>
                                  <th className="px-4 py-2">Pcs/Crate</th>
                                  <th className="px-4 py-2">Sell (£)</th>
                                  <th className="px-4 py-2">Main Seller</th>
                              </tr>
                          </thead>
                          <tbody>
                              {products.map((p, idx) => (
                                  <tr key={idx} className="border-b border-border-color hover:bg-surface/50">
                                      <td className="px-4 py-2"><input className="bg-transparent border-none w-full" value={p.ref} onChange={e => { const newP = [...products]; newP[idx].ref = e.target.value; setProducts(newP); }} /></td>
                                      <td className="px-4 py-2"><input className="bg-transparent border-none w-full" value={p.size} onChange={e => { const newP = [...products]; newP[idx].size = e.target.value; setProducts(newP); }} /></td>
                                      <td className="px-4 py-2"><input className="bg-transparent border-none w-full" type="number" value={p.pcsCrate} onChange={e => { const newP = [...products]; newP[idx].pcsCrate = Number(e.target.value); setProducts(newP); }} /></td>
                                      <td className="px-4 py-2"><input className="bg-transparent border-none w-full" type="number" value={p.sell} onChange={e => { const newP = [...products]; newP[idx].sell = Number(e.target.value); setProducts(newP); }} /></td>
                                      <td className="px-4 py-2 text-center">
                                          <input type="checkbox" checked={p.isMain} onChange={e => { const newP = [...products]; newP[idx].isMain = e.target.checked; setProducts(newP); }} />
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
                  <div className="mt-4 flex justify-end">
                      <button onClick={() => setShowPriceList(false)} className="bg-primary text-text-primary px-4 py-2 rounded">Done</button>
                  </div>
              </div>
          </div>
      )}

      {/* Left Panel: Navigation */}
      <div className={`flex-shrink-0 border-r border-border-color flex flex-col bg-bg-primary transition-all duration-300 ${isLeftPanelOpen ? 'w-80' : 'w-12'}`}>
        <div className="p-2 border-b border-border-color flex justify-between items-center">
            {isLeftPanelOpen && <h2 className="text-xl font-bold text-secondary truncate">Sales Intel Center</h2>}
            <button onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)} className="p-1 hover:bg-surface rounded text-text-secondary w-full flex justify-center">
                {isLeftPanelOpen ? '◀' : '▶'}
            </button>
        </div>
        
        {isLeftPanelOpen && (
            <>
                <div className="p-4 border-b border-border-color">
                  <div className="flex justify-between items-center mb-4">
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setShowMonitor(true)}
                            className="text-xs bg-surface hover:brightness-110 text-text-primary px-2 py-1 rounded border border-border-color"
                            title="System Monitor"
                        >
                            🖥️
                        </button>
                        <button 
                            onClick={() => setSelectedContact(null)}
                            className="text-xs bg-surface hover:brightness-110 text-text-primary px-2 py-1 rounded border border-border-color"
                            title="View Map"
                        >
                            🗺️ Map
                        </button>
                        <button 
                            onClick={handleGenerateGlobalReport}
                            className="text-xs bg-primary hover:brightness-110 text-text-primary px-2 py-1 rounded border border-border-color font-bold"
                            title="Generate National Strategy Report"
                        >
                            📊 Report
                        </button>
                        {isOffline && (
                            <span className="text-xs bg-loss-color text-text-primary px-2 py-1 rounded animate-pulse">
                                OFFLINE
                            </span>
                        )}
                    </div>
                  </div>
                  <input 
                    type="text" 
                    placeholder="Search branches..." 
                    className="w-full bg-bg-secondary border border-border-color rounded p-2 text-sm text-text-primary focus:border-primary outline-none"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                  <div className="flex gap-2 mt-2 text-xs flex-wrap">
                    <button onClick={() => { setViewMode('all'); setSelectedContact(null); }} className={`px-2 py-1 rounded ${viewMode === 'all' ? 'bg-primary' : 'bg-surface'}`}>ALL ({stats.allCount})</button>
                    <button onClick={() => { setViewMode('customers'); setSelectedContact(null); }} className={`px-2 py-1 rounded ${viewMode === 'customers' ? 'bg-primary' : 'bg-surface'}`}>CUSTOMERS ({stats.customersCount} / Qty: {stats.customerQty})</button>
                    <button onClick={() => { setViewMode('prospects'); setSelectedContact(null); }} className={`px-2 py-1 rounded ${viewMode === 'prospects' ? 'bg-primary' : 'bg-surface'}`}>PROSPECTS ({stats.prospectsCount})</button>
                    <button onClick={handleExport} className="px-2 py-1 rounded bg-profit-color hover:brightness-110 ml-auto" title="Export">⬇</button>
                  </div>
                </div>
                
                <div className="flex-1 overflow-y-auto">
                  {filteredContacts.map(contact => {
                    const contactOrders = getOrdersForContact(contact);
                    const totalQty = contactOrders.reduce((sum, o) => sum + (parseInt(o.qty) || 0), 0);
                    return (
                      <div 
                        key={contact.id} 
                        onClick={() => setSelectedContact(contact)}
                        className={`p-3 border-b border-border-color cursor-pointer hover:bg-bg-secondary ${selectedContact?.id === contact.id ? 'bg-bg-secondary border-l-4 border-l-secondary' : ''}`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="font-bold text-sm">
                            {contact.area && contact.area !== 'Unknown' && (
                                <span className="text-secondary mr-1 text-xs">[{contact.area}]</span>
                            )}
                            {contact.name}
                          </div>
                          {contactOrders.length > 0 && (
                            <div className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded ml-2 whitespace-nowrap">
                              {contactOrders.length} loads (Qty: {totalQty})
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-text-secondary">{contact.town}</div>
                      </div>
                    );
                  })}
                </div>

        {currentUser?.isAdmin && (
        <div className="p-4 border-t border-border-color bg-bg-primary">
            <button 
                onClick={() => setShowAdvancedTools(!showAdvancedTools)}
                className="w-full flex justify-between items-center text-xs font-bold text-text-secondary hover:text-text-primary mb-2"
            >
                <span>⚙️ ADVANCED TOOLS</span>
                <span>{showAdvancedTools ? '▲' : '▼'}</span>
            </button>
            
            {showAdvancedTools && (
                <div className="space-y-2 mt-4">
                    <button onClick={() => setShowPriceList(true)} className="w-full bg-secondary/20 text-secondary border border-secondary/50 rounded py-2 text-sm font-bold hover:bg-secondary/30 mb-2">
                        💰 Price List & Products
                    </button>
                    <label className="cursor-pointer w-full bg-primary/20 text-primary border border-primary/50 rounded py-2 text-sm font-bold hover:bg-primary/30 mb-2 flex items-center justify-center gap-2">
                        <span>🤖 AI Import Branch Info</span>
                        <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf,.txt,.csv,.xlsx" onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            
                            setLoading(true);
                            logEvent('SYS', `Starting AI Branch Info Import for ${file.name}`);
                            
                            try {
                                // Convert file to base64
                                const base64Data = await new Promise<string>((resolve, reject) => {
                                    const reader = new FileReader();
                                    reader.onload = () => {
                                        const result = reader.result as string;
                                        const base64 = result.split(',')[1];
                                        resolve(base64);
                                    };
                                    reader.onerror = reject;
                                    reader.readAsDataURL(file);
                                });
                                
                                const mimeType = file.type || 'application/octet-stream';
                                
                                const prompt = `
You are a sales intelligence assistant. 
I am providing a document (could be an image, PDF, or text) that contains reports, issues, or notes about various branches.
Extract the relevant issues or notes and match them to the branch name or town.
Return a JSON array of objects with the following structure:
[
  {
    "branchName": "Name of the branch or town",
    "note": "The extracted issue, report, or note"
  }
]
Only return the JSON array, no markdown formatting.
                                `;

                                const response = await executeRequest(ai, {
                                    model: 'gemini-3.1-pro-preview',
                                    contents: {
                                        parts: [
                                            { inlineData: { data: base64Data, mimeType } },
                                            { text: prompt }
                                        ]
                                    },
                                    config: {
                                        responseMimeType: "application/json",
                                    }
                                });
                                
                                const text = response.text || '[]';
                                const extractedNotes = safeJsonParse(text, []);
                                
                                if (extractedNotes.length === 0) {
                                    showAlert("No branch notes or issues found in the document.");
                                    setLoading(false);
                                    return;
                                }
                                
                                // Match and update contacts
                                let updatedCount = 0;
                                const db = getDb();
                                const newContacts = [...contacts];
                                
                                for (const noteObj of extractedNotes) {
                                    const query = (noteObj.branchName || '').toLowerCase().replace(/jewson/g, '').trim();
                                    if (!query) continue;
                                    
                                    const match = newContacts.find(c => {
                                        const cName = c.name.toLowerCase();
                                        const cTown = (c.town || '').toLowerCase();
                                        return cName.includes(query) || query.includes(cName) || 
                                               (cTown && (cTown.includes(query) || query.includes(cTown)));
                                    });
                                    
                                    if (match) {
                                        const timestamp = new Date().toLocaleDateString();
                                        const newNote = `[${timestamp} AI Import]: ${noteObj.note}`;
                                        match.notes = match.notes ? `${match.notes}\n\n${newNote}` : newNote;
                                        
                                        await db.collection('contacts').doc(match.id).update({ notes: match.notes });
                                        updatedCount++;
                                    }
                                }
                                
                                setContacts(newContacts);
                                logEvent('SYS', `AI Import completed. Updated ${updatedCount} branches.`);
                                showAlert(`Successfully extracted and updated notes for ${updatedCount} branches.`);
                                
                            } catch (error: any) {
                                console.error("AI Import failed", error);
                                logEvent('ERR', `AI Import failed: ${error.message}`);
                                showAlert(`Failed to process document: ${error.message}`);
                            } finally {
                                setLoading(false);
                            }
                        }} />
                    </label>
                    <label className="cursor-pointer w-full bg-secondary/20 text-secondary border border-secondary/50 rounded py-2 text-sm font-bold hover:bg-secondary/30 mb-2 flex items-center justify-center gap-2">
                        <span>🤖 AI Import Loads</span>
                        <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf,.txt,.csv,.xlsx" onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            
                            setLoading(true);
                            logEvent('SYS', `Starting AI Loads Import for ${file.name}`);
                            
                            try {
                                // Convert file to base64
                                const base64Data = await new Promise<string>((resolve, reject) => {
                                    const reader = new FileReader();
                                    reader.onload = () => {
                                        const result = reader.result as string;
                                        const base64 = result.split(',')[1];
                                        resolve(base64);
                                    };
                                    reader.onerror = reject;
                                    reader.readAsDataURL(file);
                                });
                                
                                const mimeType = file.type || 'application/octet-stream';
                                
                                const prompt = `
You are a sales intelligence assistant. 
I am providing a document (image, PDF, or text) that contains a list of loads or orders.
Extract the orders and return a JSON array of objects with the following structure:
[
  {
    "town": "Name of the branch, town, or site (e.g. 'plymouth richmanwalk')",
    "qty": "Quantity or number of loads (e.g. '1', '2')",
    "date": "Date of the order if available (e.g. '2026-03-03'), otherwise leave empty",
    "productRef": "Product reference or name if available, otherwise leave empty",
    "status": "Status if available (e.g. 'Pending', 'Delivered'), otherwise 'Pending'"
  }
]
Only return the JSON array, no markdown formatting.
                                `;

                                const response = await executeRequest(ai, {
                                    model: 'gemini-3.1-pro-preview',
                                    contents: {
                                        parts: [
                                            { inlineData: { data: base64Data, mimeType } },
                                            { text: prompt }
                                        ]
                                    },
                                    config: {
                                        responseMimeType: "application/json",
                                    }
                                });
                                
                                const text = response.text || '[]';
                                const extractedOrders = safeJsonParse(text, []);
                                
                                if (extractedOrders.length === 0) {
                                    showAlert("No orders found in the document.");
                                    setLoading(false);
                                    return;
                                }
                                
                                const db = getDb();
                                const batchSize = 400;
                                let addedCount = 0;
                                
                                for (let i = 0; i < extractedOrders.length; i += batchSize) {
                                    const batch = db.batch();
                                    const chunk = extractedOrders.slice(i, i + batchSize);
                                    chunk.forEach((o: any) => {
                                        const docRef = db.collection('orders').doc();
                                        batch.set(docRef, {
                                            town: o.town || 'Unknown',
                                            qty: o.qty || '1',
                                            date: o.date || new Date().toISOString().split('T')[0],
                                            ref: o.productRef || `AI-ORD-${Date.now()}`,
                                            status: o.status || 'Pending'
                                        });
                                        addedCount++;
                                    });
                                    await batch.commit();
                                }
                                
                                logEvent('SYS', `AI Loads Import completed. Added ${addedCount} orders.`);
                                showAlert(`Successfully extracted and added ${addedCount} orders.`);
                                
                            } catch (error: any) {
                                console.error("AI Import failed", error);
                                logEvent('ERR', `AI Loads Import failed: ${error.message}`);
                                showAlert(`Failed to process document: ${error.message}`);
                            } finally {
                                setLoading(false);
                            }
                        }} />
                    </label>
                    <button 
                        onClick={handleBulkUpdateBranches} 
                        disabled={updatingBranches || filteredContacts.length === 0}
                        className="w-full bg-profit-bg text-profit-color border border-profit-color rounded py-2 text-sm font-bold hover:brightness-110 mb-2 disabled:opacity-50"
                    >
                        {updatingBranches ? `Updating... (${updateProgress.current}/${updateProgress.total})` : '🌐 AI Bulk Update Branches'}
                    </button>
                    <button 
                        onClick={handleFastFormatFix} 
                        disabled={updatingBranches || filteredContacts.length === 0}
                        className="w-full bg-primary/20 text-primary border border-primary/50 rounded py-2 text-sm font-bold hover:bg-primary/30 mb-2 disabled:opacity-50"
                    >
                        ⚡ Fast Format Fix (No API)
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                        <label className="cursor-pointer bg-surface hover:brightness-110 text-xs px-2 py-1 rounded text-center">
                            Upload Contacts
                            <input type="file" className="hidden" accept=".csv,.xlsx" onChange={(e) => handleFileUpload(e, 'contacts')} />
                        </label>
                        <label className="cursor-pointer bg-surface hover:brightness-110 text-xs px-2 py-1 rounded text-center">
                            Upload Orders
                            <input type="file" className="hidden" accept=".csv,.xlsx" onChange={(e) => handleFileUpload(e, 'orders')} />
                        </label>
                        <button onClick={() => handleDeleteAll('contacts')} className="bg-loss-bg hover:bg-loss-color text-text-primary text-xs px-2 py-1 rounded">Delete Contacts</button>
                        <button onClick={() => handleDeleteAll('orders')} className="bg-loss-bg hover:bg-loss-color text-text-primary text-xs px-2 py-1 rounded">Delete Orders</button>
                        <button onClick={handleKillSwitch} className="col-span-2 bg-loss-color hover:brightness-110 text-text-primary font-bold text-xs px-2 py-2 rounded shadow-lg shadow-loss-color/50 border border-loss-color mt-2">⚠️ KILL SWITCH (WIPE ALL DATA)</button>
                    </div>
                </div>
            )}
            {loading && <div className="text-xs text-primary mt-1">Processing...</div>}
        </div>
        )}
        </>
        )}
      </div>

      {/* Center Panel: Workstation */}
      <div className="flex-1 flex flex-col border-r border-border-color bg-bg-primary">
        {selectedContact ? (
          <div className="p-6 flex-1 overflow-y-auto flex flex-col">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h1 className="text-2xl font-bold text-text-primary">{selectedContact.name}</h1>
                    <p className="text-text-secondary">{selectedContact.town} • {selectedContact.area}</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => window.print()} className="bg-surface hover:brightness-110 text-text-primary px-3 py-2 rounded text-sm">🖨</button>
                    <button onClick={() => handleDeleteContact(selectedContact.id)} className="bg-loss-color hover:brightness-110 text-text-primary px-3 py-2 rounded text-sm">🗑</button>
                </div>
            </div>

            {/* Split View: Intel vs Details */}
            <div className="grid grid-cols-2 gap-4 mb-6 h-96">
                {/* Left: AI Salesman */}
                <div className="bg-bg-secondary rounded-xl p-4 border border-border-color flex flex-col overflow-hidden">
                    <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-secondary uppercase">⚡ AI Sales Intel</h3>
                            {!aiAdvice?.strategy && !loadingStrategy && (
                                <button 
                                    onClick={() => fetchSalesStrategy(selectedContact)}
                                    className="text-xs bg-secondary hover:brightness-110 text-bg-primary font-bold px-2 py-1 rounded"
                                >
                                    Generate
                                </button>
                            )}
                        </div>
                        <WeatherWidget town={selectedContact.town} lat={selectedContact.lat} lng={selectedContact.lng} />
                    </div>
                    <div className="flex-1 overflow-y-auto text-sm text-text-primary space-y-2 pr-2 custom-scrollbar">
                        {loadingStrategy ? (
                            <div className="animate-pulse space-y-2">
                                <div className="h-4 bg-surface rounded w-3/4"></div>
                                <div className="h-4 bg-surface rounded w-1/2"></div>
                                <div className="h-4 bg-surface rounded w-full"></div>
                            </div>
                        ) : aiAdvice ? (
                            aiAdvice.error ? (
                                <div className="text-loss-color">{aiAdvice.error}</div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="whitespace-pre-wrap leading-relaxed">
                                        <span className="font-bold text-text-primary block mb-1">Strategy:</span>
                                        {aiAdvice.strategy}
                                    </div>
                                </div>
                            )
                        ) : (
                            <div className="text-text-secondary italic flex h-full items-center justify-center">Click Generate to get AI sales strategy for this branch.</div>
                        )}
                    </div>
                </div>

                {/* Right: Contact Details (Compact) */}
                <div className="bg-bg-secondary rounded-xl p-4 border border-border-color flex flex-col">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="text-sm font-bold text-text-secondary uppercase">Contact Details</h3>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => handleUpdateBranch(selectedContact)} 
                                disabled={updatingBranches}
                                className="text-xs bg-profit-color hover:brightness-110 text-text-primary px-2 py-1 rounded disabled:opacity-50"
                            >
                                {updatingBranches ? 'Updating...' : '🌐 Update Info'}
                            </button>
                            <button onClick={() => { setEditForm(selectedContact); setShowEditModal(true); }} className="text-xs bg-primary hover:brightness-110 text-text-primary px-2 py-1 rounded">✎ Edit</button>
                        </div>
                    </div>
                    <div className="space-y-3 text-sm flex-1 overflow-y-auto">
                        <div className="flex justify-between border-b border-border-color/50 pb-1">
                            <span className="text-text-secondary">Manager</span>
                            <span className="text-text-primary font-medium">{selectedContact.managerName || '-'}</span>
                        </div>
                        <div className="flex justify-between border-b border-border-color/50 pb-1">
                            <span className="text-text-secondary">Landline</span>
                            <span className="text-text-primary font-mono">{selectedContact.landline || '-'}</span>
                        </div>
                        <div className="flex justify-between border-b border-border-color/50 pb-1">
                            <span className="text-text-secondary">Mobile</span>
                            <span className="text-text-primary font-mono">{selectedContact.mobile || '-'}</span>
                        </div>
                        {selectedContact.phone && 
                         String(selectedContact.phone).trim() !== String(selectedContact.mobile).trim() && 
                         String(selectedContact.phone).trim() !== String(selectedContact.landline).trim() && 
                         String(selectedContact.phone).trim() !== `${String(selectedContact.mobile).trim()} / ${String(selectedContact.landline).trim()}` && (
                            <div className="flex justify-between border-b border-border-color/50 pb-1">
                                <span className="text-text-secondary">Other Phone</span>
                                <span className="text-text-primary font-mono">{selectedContact.phone}</span>
                            </div>
                        )}
                        <div className="flex justify-between border-b border-border-color/50 pb-1">
                            <span className="text-text-secondary">Email</span>
                            <span className="text-text-primary truncate max-w-[150px]" title={selectedContact.email}>{selectedContact.email || '-'}</span>
                        </div>
                        <div className="pt-2">
                            <span className="text-text-secondary block text-xs mb-1">Address</span>
                            <span className="text-text-primary text-xs block">{selectedContact.address}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Section: Tabs for Notes and Emails */}
            <div className="bg-bg-secondary rounded-xl p-4 border border-border-color flex-1 min-h-[300px] flex flex-col">
                <div className="flex border-b border-border-color mb-3">
                    <button 
                        onClick={() => setBottomTab('notes')}
                        className={`px-4 py-2 text-sm font-bold uppercase ${bottomTab === 'notes' ? 'text-primary border-b-2 border-primary' : 'text-text-secondary hover:text-text-primary'}`}
                    >
                        Branch Notes
                    </button>
                    <button 
                        onClick={() => setBottomTab('emails')}
                        className={`px-4 py-2 text-sm font-bold uppercase ${bottomTab === 'emails' ? 'text-primary border-b-2 border-primary' : 'text-text-secondary hover:text-text-primary'}`}
                    >
                        Email Drafts & History
                    </button>
                </div>

                {bottomTab === 'notes' ? (
                    <>
                        <textarea 
                            className="w-full flex-1 bg-bg-primary border border-border-color rounded p-3 text-sm text-text-primary resize-none focus:border-primary outline-none font-mono"
                            placeholder="Add notes about this branch..."
                            value={selectedContact.notes || ''}
                            onChange={(e) => setSelectedContact({...selectedContact, notes: e.target.value})}
                        ></textarea>
                        <div className="mt-2 flex justify-between">
                            <button className="text-xs text-text-secondary hover:text-text-primary">📷 Attach Image</button>
                            <button onClick={handleSaveNote} className="bg-primary text-text-primary px-3 py-1 rounded text-xs">Save Note (Timestamp)</button>
                        </div>
                    </>
                ) : (
                    <div className="flex flex-col flex-1 gap-4 overflow-y-auto custom-scrollbar pr-2">
                        {/* Email Instructions */}
                        <div className="bg-bg-primary p-3 rounded border border-border-color">
                            <label className="block text-xs font-bold text-text-secondary mb-1">What do you want to say? (Optional instructions for AI)</label>
                            <textarea 
                                className="w-full bg-surface border border-border-color rounded p-2 text-sm text-text-primary resize-none focus:border-primary outline-none"
                                placeholder="e.g., Mention the new roofing promotion, ask for a meeting next Tuesday..."
                                rows={2}
                                value={emailInstructions}
                                onChange={(e) => setEmailInstructions(e.target.value)}
                            ></textarea>
                            <div className="flex justify-between items-center mt-2">
                                <div className="flex gap-2">
                                    <select 
                                        value={emailTone} 
                                        onChange={(e) => setEmailTone(e.target.value as any)}
                                        className="bg-bg-secondary text-xs text-text-primary border border-border-color rounded px-2 py-1"
                                    >
                                        <option value="formal">Formal</option>
                                        <option value="professional">Professional</option>
                                        <option value="friendly">Friendly</option>
                                    </select>
                                    <select 
                                        value={emailLength} 
                                        onChange={(e) => setEmailLength(e.target.value as any)}
                                        className="bg-bg-secondary text-xs text-text-primary border border-border-color rounded px-2 py-1"
                                    >
                                        <option value="short">Short</option>
                                        <option value="medium">Medium</option>
                                        <option value="long">Long</option>
                                    </select>
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={handleWriteManually}
                                        className="text-xs bg-surface hover:brightness-110 text-text-primary px-3 py-1 rounded"
                                    >
                                        ✍️ Write Manually
                                    </button>
                                    <button 
                                        onClick={() => generateEmailDraft(selectedContact, emailTone, emailLength, emailInstructions)}
                                        className="text-xs bg-secondary hover:brightness-110 text-bg-primary font-bold px-3 py-1 rounded disabled:opacity-50"
                                        disabled={loadingEmail}
                                    >
                                        {loadingEmail ? 'Generating...' : '✨ Generate Email Draft'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Editable Draft */}
                        {editableEmail && (
                            <div className="bg-bg-primary p-3 rounded border border-border-color flex flex-col flex-1">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm font-bold text-text-primary">Current Draft</span>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={handleSendEmail}
                                            className="text-xs bg-primary hover:brightness-110 text-text-primary px-3 py-1 rounded flex items-center gap-1 font-bold"
                                        >
                                            📧 Send & Save
                                        </button>
                                        <button 
                                            onClick={handleMarkEmailSent}
                                            className="text-xs bg-surface hover:brightness-110 text-text-primary px-3 py-1 rounded flex items-center gap-1"
                                        >
                                            ✅ Mark as Sent
                                        </button>
                                        <button 
                                            onClick={handleDiscardDraft}
                                            className="text-xs bg-red-500/20 text-red-500 hover:bg-red-500/30 px-3 py-1 rounded flex items-center gap-1"
                                        >
                                            🗑️ Discard
                                        </button>
                                    </div>
                                </div>
                                <input 
                                    type="text"
                                    className="w-full bg-surface border border-border-color rounded p-2 text-sm text-text-primary mb-2 focus:border-primary outline-none"
                                    value={editableEmail.subject}
                                    onChange={(e) => setEditableEmail({...editableEmail, subject: e.target.value})}
                                    placeholder="Subject"
                                />
                                <textarea 
                                    className="w-full flex-1 min-h-[150px] bg-surface border border-border-color rounded p-2 text-sm text-text-primary resize-none focus:border-primary outline-none"
                                    value={editableEmail.body}
                                    onChange={(e) => setEditableEmail({...editableEmail, body: e.target.value})}
                                    placeholder="Email body..."
                                ></textarea>
                            </div>
                        )}

                        {/* Email History */}
                        {selectedContact.emails && selectedContact.emails.length > 0 && (
                            <div className="mt-4">
                                <h4 className="text-xs font-bold text-text-secondary uppercase mb-2">Saved Emails</h4>
                                <div className="space-y-2">
                                    {selectedContact.emails.map(email => (
                                        <div key={email.id} className="bg-bg-primary p-3 rounded border border-border-color">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-xs font-bold text-text-primary">{email.subject}</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] text-text-secondary">{email.date} • {email.status}</span>
                                                    <button 
                                                        onClick={() => handleDeleteEmail(email.id)}
                                                        className="text-text-secondary hover:text-red-500 transition-colors"
                                                        title="Delete Email"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="text-xs text-text-secondary whitespace-pre-wrap line-clamp-3">{email.body}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
             <div className="flex-1 relative">
                 <InteractiveMap 
                    markers={mapMarkers.filter(m => m.lat && m.lat !== 0)} 
                    onMarkerClick={(id) => {
                        const contact = contacts.find(c => c.id === id);
                        if (contact) setSelectedContact(contact);
                    }}
                 />
                 <div className="absolute bottom-4 left-4 bg-bg-primary/80 p-3 rounded text-xs text-text-primary border border-border-color shadow-xl z-10">
                     <div className="font-bold mb-1 text-sm">UK BRANCH NETWORK</div>
                     <div className="text-text-secondary mb-2">Showing {mapMarkers.filter(m => m.lat && m.lat !== 0).length} mapped locations</div>
                     {mapMarkers.filter(m => !m.lat || m.lat === 0).length > 0 && (
                         <div className="mt-2 pt-2 border-t border-border-color">
                             <div className="text-loss-color text-[10px] mb-2">{mapMarkers.filter(m => !m.lat || m.lat === 0).length} unmapped (missing coordinates)</div>
                             <button 
                                 onClick={async () => {
                                     const missing = contacts.filter(c => !c.lat || c.lat === 0);
                                     if (missing.length === 0) return;
                                     
                                     setConfirmDialog({
                                         isOpen: true,
                                         message: `This will attempt to find coordinates for ${missing.length} unmapped branches using their postcodes (Free Bulk API). This is very fast and uses 0 Google API calls. Continue?`,
                                         onConfirm: async () => {
                                             setLoading(true);
                                             logEvent('SYS', `Starting bulk postcode geocoding for ${missing.length} branches`);
                                             
                                             try {
                                                 const db = getDb();
                                                 let updatedCount = 0;
                                                 
                                                 // Filter contacts that actually have a postcode
                                                 const withPostcode = missing.filter(c => c.postcode && c.postcode.trim().length > 4);
                                                 const withoutPostcode = missing.length - withPostcode.length;
                                                 
                                                 if (withPostcode.length === 0) {
                                                     showAlert("None of the unmapped branches have a valid postcode.");
                                                     setLoading(false);
                                                     return;
                                                 }

                                                 const batchSize = 100; // postcodes.io allows up to 100 per request
                                                 for (let i = 0; i < withPostcode.length; i += batchSize) {
                                                     const batch = withPostcode.slice(i, i + batchSize);
                                                     const postcodes = batch.map(c => c.postcode.trim());
                                                     
                                                     try {
                                                         const response = await fetch(`https://api.postcodes.io/postcodes`, {
                                                             method: 'POST',
                                                             headers: { 'Content-Type': 'application/json' },
                                                             body: JSON.stringify({ postcodes })
                                                         });
                                                         
                                                         const data = await response.json();
                                                         
                                                         if (data.status === 200 && data.result) {
                                                             const validUpdates: Contact[] = [];
                                                             
                                                             batch.forEach(contact => {
                                                                 // Find the result for this contact's postcode
                                                                 const match = data.result.find((r: any) => r.query === contact.postcode.trim());
                                                                 if (match && match.result && match.result.latitude && match.result.longitude) {
                                                                     validUpdates.push({
                                                                         ...contact,
                                                                         lat: match.result.latitude,
                                                                         lng: match.result.longitude
                                                                     });
                                                                 }
                                                             });
                                                             
                                                             if (validUpdates.length > 0) {
                                                                 const firestoreBatch = db.batch();
                                                                 
                                                                 validUpdates.forEach(updated => {
                                                                     const docRef = db.collection('contacts').doc(updated.id);
                                                                     firestoreBatch.update(docRef, { lat: updated.lat, lng: updated.lng });
                                                                 });
                                                                 
                                                                 await firestoreBatch.commit();
                                                                 
                                                                 setContacts(prev => {
                                                                     const newContacts = [...prev];
                                                                     validUpdates.forEach(updated => {
                                                                         const index = newContacts.findIndex(c => c.id === updated.id);
                                                                         if (index !== -1) newContacts[index] = updated;
                                                                     });
                                                                     return newContacts;
                                                                 });
                                                                 
                                                                 updatedCount += validUpdates.length;
                                                             }
                                                         }
                                                     } catch (e) {
                                                         console.error("Bulk geocode failed for batch", e);
                                                     }
                                                     
                                                     // Small delay to be polite to the free API
                                                     await new Promise(r => setTimeout(r, 300));
                                                 }
                                                 
                                                 logEvent('SYS', `Bulk Geocoding complete. Mapped ${updatedCount} new branches.`);
                                                 let msg = `Successfully mapped ${updatedCount} branches using postcodes.`;
                                                 if (withoutPostcode > 0) {
                                                     msg += `\nNote: ${withoutPostcode} branches were skipped because they don't have a valid postcode.`;
                                                 }
                                                 showAlert(msg);
                                             } catch (error: any) {
                                                 console.error("Geocoding process failed", error);
                                                 logEvent('ERR', `Geocoding failed: ${error.message}`);
                                                 showAlert(`Failed to complete geocoding: ${error.message}`);
                                             } finally {
                                                 setLoading(false);
                                             }
                                         }
                                     });
                                 }}
                                 className="w-full bg-surface hover:brightness-110 text-text-primary text-xs py-1 px-2 rounded border border-border-color transition-colors"
                             >
                                 Fix Missing Coordinates
                             </button>
                         </div>
                     )}
                 </div>
             </div>
          </div>
        )}
      </div>

      {/* Right Panel: Map & History */}
      <div className="w-[40rem] flex-shrink-0 bg-bg-primary border-l border-border-color flex flex-col">
        {/* TOP HALF: Leads & Map */}
        <div className="h-1/2 border-b border-border-color flex">
            {/* Leads Column */}
            {selectedContact ? (
            <div className="flex-1 overflow-y-auto p-4 border-r border-border-color bg-bg-primary">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-sm font-bold text-text-secondary uppercase">
                        Local Leads ({nearbyLeads.length})
                    </h3>
                    <button 
                        className="text-xs bg-profit-color hover:brightness-110 text-text-primary px-2 py-1 rounded"
                        onClick={() => {
                            handleStructuredLeadSearch({ location_filter: selectedContact.town, limit: 10, country_code: 'UK' }, 'general_search', 'manual');
                            handleNavigationRequest('lead-intel');
                        }}
                    >
                        + Find Leads
                    </button>
                </div>
                {nearbyLeads.length > 0 ? (
                    <div className="space-y-3">
                        {nearbyLeads.map(lead => {
                            const isSent = selectedContact.sentLeads?.includes(lead.id);
                            return (
                            <div 
                                key={lead.id} 
                                className={`bg-bg-secondary p-3 rounded border ${isSent ? 'border-primary' : 'border-border-color'} cursor-pointer hover:bg-surface transition-colors group relative`}
                                onClick={() => handleNavigationRequest('lead-dossier', { lead })}
                            >
                                <div className="text-sm font-medium text-text-primary line-clamp-2 pr-12" title={lead.title}>
                                    {isSent && <span className="text-[10px] bg-primary text-bg-secondary px-1 py-0.5 rounded mr-1 font-bold">SENT</span>}
                                    {lead.title}
                                </div>
                                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                        onClick={(e) => handleMarkLeadSent(lead.id, e)}
                                        className={`p-1 rounded text-text-primary ${isSent ? 'bg-surface hover:bg-loss-color' : 'bg-primary hover:brightness-110'}`}
                                        title={isSent ? "Unmark as Sent" : "Mark as Sent to Branch"}
                                    >
                                        {isSent ? '✕' : '✓'}
                                    </button>
                                    <button 
                                        onClick={(e) => handlePrintLead(lead, e)}
                                        className="p-1 bg-surface hover:brightness-110 rounded text-text-primary"
                                        title="Print Lead"
                                    >
                                        🖨️
                                    </button>
                                </div>
                                <div className="text-xs text-text-secondary mt-1 truncate" title={lead.address}>{lead.address}</div>
                                <div className="flex justify-between mt-2 items-center">
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/50">{lead.projectStage || 'Unknown Stage'}</span>
                                    <span className="text-[10px] text-secondary font-mono">{lead.projectValue || 'Value Unknown'}</span>
                                </div>
                            </div>
                        )})}
                    </div>
                ) : (
                    <div className="text-center text-text-secondary text-sm py-8 px-4 bg-bg-secondary rounded border border-border-color">
                        <div className="text-2xl mb-2">📍</div>
                        <p className="mb-3">No local leads found for <strong>{selectedContact.town}</strong>.</p>
                        <p className="text-xs">Click "+ Find Leads" to search the area.</p>
                    </div>
                )}
            </div>
            ) : (
                <div className="flex-1 border-r border-border-color bg-bg-primary flex items-center justify-center text-text-secondary text-sm">
                    Select a branch to view leads
                </div>
            )}

            {/* Map Column */}
            <div className="flex-1 bg-bg-secondary flex items-center justify-center relative p-2">
                {selectedContact ? (
                    <InteractiveMap 
                        lat={selectedContact.lat && selectedContact.lat !== 0 ? selectedContact.lat : undefined} 
                        lng={selectedContact.lng && selectedContact.lng !== 0 ? selectedContact.lng : undefined}
                        address={(!selectedContact.lat || selectedContact.lat === 0) ? (selectedContact.address || selectedContact.town) : undefined}
                    />
                ) : (
                    <div className="text-text-secondary text-sm">Select a branch to view detailed map</div>
                )}
            </div>
        </div>

        {/* BOTTOM HALF: Order History & Call Records */}
        <div className="flex-1 overflow-hidden flex">
            {/* Order History Column */}
            <div className="flex-1 overflow-y-auto p-4 border-r border-border-color">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-sm font-bold text-text-secondary uppercase">
                        Order History {selectedContact ? `(${getOrdersForContact(selectedContact).length})` : ''}
                    </h3>
                    {selectedContact && (
                        <div className="flex gap-2">
                            <button 
                                onClick={() => { setOrderForm({}); setShowOrderModal(true); }}
                                className="text-xs bg-primary hover:brightness-110 text-text-primary px-2 py-1 rounded"
                            >
                                + Add Load
                            </button>
                        </div>
                    )}
                </div>
                {selectedContact ? (
                    <div className="space-y-3">
                        {getOrdersForContact(selectedContact).map(order => (
                            <div key={order.id} className="bg-bg-secondary p-3 rounded border border-border-color relative group">
                                <div className="flex justify-between mb-1">
                                    <span className="font-mono text-xs text-secondary">{order.ref}</span>
                                    <span className={`text-[10px] px-1 rounded ${order.status === 'Delivered' ? 'bg-profit-bg text-profit-color' : 'bg-secondary/20 text-secondary'}`}>
                                        {order.status}
                                    </span>
                                </div>
                                <div className="text-sm font-medium">{order.product}</div>
                                <div className="text-xs text-text-secondary">{order.date} • Qty: {order.qty}</div>
                                
                                <div className="absolute top-2 right-2 hidden group-hover:flex gap-1">
                                    <button onClick={() => { setOrderForm(order); setShowOrderModal(true); }} className="p-1 bg-surface hover:brightness-110 rounded text-text-primary" title="Edit">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                                    </button>
                                    <button onClick={() => handleDeleteOrder(order.id)} className="p-1 bg-surface hover:brightness-110 rounded text-text-primary hover:text-text-primary" title="Delete">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                        {getOrdersForContact(selectedContact).length === 0 && (
                            <div className="text-center text-text-secondary text-sm py-4">No orders found for this branch.</div>
                        )}
                    </div>
                ) : (
                    <div className="text-center text-text-secondary text-sm py-4">Select a branch to view history.</div>
                )}
            </div>

            {/* Call Records Column */}
            <div className="flex-1 overflow-y-auto p-4">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-sm font-bold text-text-secondary uppercase">
                        Call Records {selectedContact && (selectedContact.callRecords || []).length > 0 ? `(${(selectedContact.callRecords || []).length})` : ''}
                    </h3>
                    {selectedContact && (
                        <div className="flex gap-2">
                            <button 
                                onClick={() => { setCallForm({notes: '', outcome: 'Interested'}); setShowCallModal(true); }}
                                className="text-xs bg-profit-color hover:brightness-110 text-text-primary px-2 py-1 rounded flex items-center gap-1"
                            >
                                <span>📞</span> Log Call
                            </button>
                            <button 
                                onClick={() => setIsRecordingModalOpen(true)}
                                className="text-xs bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded flex items-center gap-1"
                            >
                                <span>🎙️</span> Record
                            </button>
                        </div>
                    )}
                </div>
                {selectedContact ? (
                    <div className="space-y-3">
                        {(selectedContact.callRecords || []).map(record => (
                            <div key={record.id} className="bg-bg-secondary p-3 rounded border border-border-color relative group">
                                <div className="flex justify-between mb-1">
                                    <span className="font-mono text-xs text-text-secondary">{new Date(record.date).toLocaleDateString()}</span>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[10px] px-1 rounded ${record.outcome === 'Interested' ? 'bg-profit-bg text-profit-color' : record.outcome === 'Not Interested' ? 'bg-loss-color text-loss-color' : 'bg-surface text-text-primary'}`}>
                                            {record.outcome || 'Unknown'}
                                        </span>
                                        <button 
                                            onClick={() => handleDeleteCallRecord(selectedContact.id, record.id)}
                                            className="text-text-secondary hover:text-loss-color opacity-0 group-hover:opacity-100 transition-opacity"
                                            title="Delete Call Record"
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                        </button>
                                    </div>
                                </div>
                                <div className="text-sm text-text-primary whitespace-pre-wrap">{record.notes}</div>
                            </div>
                        ))}
                        {(selectedContact.callRecords || []).length === 0 && (
                            <div className="text-center text-text-secondary text-sm py-4">No call records found.</div>
                        )}
                    </div>
                ) : (
                    <div className="text-center text-text-secondary text-sm py-4">Select a branch to view calls.</div>
                )}
            </div>
        </div>
      </div>

      {/* Monitor Modal */}
      {showGlobalReportModal && (
          <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
              <div className="bg-bg-primary rounded-xl border border-border-color p-6 w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh]">
                  <div className="flex justify-between items-center mb-4 border-b border-border-color pb-2">
                      <h2 className="text-xl font-bold text-primary">National Strategy Report</h2>
                      <button onClick={() => setShowGlobalReportModal(false)} className="text-text-secondary hover:text-text-primary">✕</button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-4 bg-bg-secondary rounded border border-border-color custom-scrollbar">
                      {generatingReport ? (
                          <div className="flex flex-col items-center justify-center h-full space-y-4">
                              <div className="loader border-primary"></div>
                              <div className="text-text-secondary animate-pulse">Analyzing market data and generating strategy...</div>
                          </div>
                      ) : globalReport?.error ? (
                          <div className="text-loss-color text-center">{globalReport.error}</div>
                      ) : (
                          <div className="markdown-body text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
                              <ReactMarkdown>{globalReport?.content || ''}</ReactMarkdown>
                          </div>
                      )}
                  </div>
                  
                  <div className="mt-4 pt-4 border-t border-border-color flex justify-end gap-3">
                      <button onClick={() => setShowGlobalReportModal(false)} className="btn tertiary">Close</button>
                      <button 
                          onClick={() => {
                              const printWindow = window.open('', '_blank');
                              if (printWindow) {
                                  printWindow.document.write(`
                                      <html>
                                          <head>
                                              <title>National Strategy Report</title>
                                              <style>
                                                  body { font-family: sans-serif; line-height: 1.6; padding: 2rem; color: #333; }
                                                  h1, h2, h3 { color: #111; }
                                                  pre { background: #f4f4f4; padding: 1rem; border-radius: 4px; white-space: pre-wrap; }
                                              </style>
                                          </head>
                                          <body>
                                              <h1>National Strategy Report</h1>
                                              <pre>${globalReport?.content}</pre>
                                              <script>window.print(); window.close();</script>
                                          </body>
                                      </html>
                                  `);
                                  printWindow.document.close();
                              }
                          }} 
                          className="btn"
                          disabled={generatingReport || !globalReport?.content}
                      >
                          🖨️ Print Report
                      </button>
                  </div>
              </div>
          </div>
      )}

      {showMonitor && (
          <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
              <div className="bg-bg-primary rounded-xl border border-border-color p-6 w-full max-w-md shadow-2xl font-mono">
                  <div className="flex justify-between items-center mb-4 border-b border-border-color pb-2">
                      <h2 className="text-lg font-bold text-profit-color">SYSTEM MONITOR</h2>
                      <button onClick={() => setShowMonitor(false)} className="text-text-secondary hover:text-text-primary">✕</button>
                  </div>
                  
                  <div className="space-y-4 text-xs">
                      <div className="flex justify-between items-center">
                          <span className="text-text-secondary">API STATUS</span>
                          <span className="text-profit-color font-bold">ONLINE ●</span>
                      </div>
                      <div className="flex justify-between items-center">
                          <span className="text-text-secondary">PROCESS STATUS</span>
                          <span className={loading ? "text-secondary animate-pulse" : "text-text-primary"}>
                              {loading ? 'PROCESSING...' : 'IDLE'}
                          </span>
                      </div>
                      
                      <div className="h-px bg-bg-secondary my-2"></div>
                      
                      <div className="grid grid-cols-2 gap-4">
                          <div className="bg-bg-secondary p-2 rounded">
                              <div className="text-text-secondary mb-1">CONTACTS</div>
                              <div className="text-xl text-text-primary font-bold">{stats.allCount}</div>
                          </div>
                          <div className="bg-bg-secondary p-2 rounded">
                              <div className="text-text-secondary mb-1">ORDERS</div>
                              <div className="text-xl text-text-primary font-bold">{orders.length}</div>
                          </div>
                          <div className="bg-bg-secondary p-2 rounded">
                              <div className="text-text-secondary mb-1">TOTAL QTY</div>
                              <div className="text-xl text-secondary font-bold">{stats.totalQty}</div>
                          </div>
                          <div className="bg-bg-secondary p-2 rounded">
                              <div className="text-text-secondary mb-1">CUSTOMERS</div>
                              <div className="text-xl text-primary font-bold">{stats.customersCount}</div>
                          </div>
                      </div>
                      
                      <div className="h-px bg-bg-secondary my-2"></div>
                      
                      <div className="text-text-secondary">
                          <div>LAST SYNC: {new Date().toLocaleTimeString()}</div>
                          <div>MEMORY USAGE: {Math.round(JSON.stringify(contacts).length / 1024)} KB</div>
                      </div>
                  </div>
                  
                  <div className="mt-6 pt-4 border-t border-border-color">
                      <div className="text-[10px] text-text-secondary uppercase tracking-widest text-center">Sales Intel Center v2.1</div>
                  </div>
              </div>
          </div>
      )}

      {isRecordingModalOpen && selectedContact && (
          <BranchCallRecorderModal 
              contact={selectedContact} 
              onSave={(notes, outcome) => handleAddCallRecord(selectedContact.id, notes, outcome)}
              onClose={() => setIsRecordingModalOpen(false)} 
          />
      )}
    </div>
  );
};

export default SalesIntelCenterView;
