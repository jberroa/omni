import React, { useState, useEffect } from 'react';
import { db, collection, onSnapshot, query, addDoc, serverTimestamp, deleteDoc, doc, updateDoc } from '../lib/firebase';
import { Location } from '../types/inventory';
import { MapPin, Plus, FileSpreadsheet, QrCode, Download, Search, Trash2, Edit2, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import * as XLSX from 'xlsx';
import { ConfirmModal } from '../components/ConfirmModal';

export function LocationDashboard() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [stockCounts, setStockCounts] = useState<Record<string, number>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [isAddingLocation, setIsAddingLocation] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [newLocationNumber, setNewLocationNumber] = useState('');
  const [locationToDelete, setLocationToDelete] = useState<Location | null>(null);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [editName, setEditName] = useState('');
  const [editNumber, setEditNumber] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'locations'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const locsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Location));
      setLocations(locsData);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'stock'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const counts: Record<string, number> = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.locationId && data.quantity > 0) {
          counts[data.locationId] = (counts[data.locationId] || 0) + 1;
        }
      });
      setStockCounts(counts);
    });
    return unsubscribe;
  }, []);

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLocationName.trim()) return;

    try {
      await addDoc(collection(db, 'locations'), {
        name: newLocationName.trim(),
        locationNumber: newLocationNumber.trim() || Math.floor(1000 + Math.random() * 9000).toString(),
        createdAt: serverTimestamp()
      });
      setNewLocationName('');
      setNewLocationNumber('');
      setIsAddingLocation(false);
    } catch (error) {
      console.error("Error adding location:", error);
    }
  };

  const confirmDeleteLocation = async () => {
    if (!locationToDelete) return;
    try {
      await deleteDoc(doc(db, 'locations', locationToDelete.id));
      if (selectedLocation?.id === locationToDelete.id) setSelectedLocation(null);
      setLocationToDelete(null);
    } catch (error) {
      console.error("Error deleting location:", error);
    }
  };

  const handleEditLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLocation || !editName.trim()) return;

    try {
      await updateDoc(doc(db, 'locations', editingLocation.id), {
        name: editName.trim(),
        locationNumber: editNumber.trim()
      });
      setEditingLocation(null);
      setEditName('');
      setEditNumber('');
    } catch (error) {
      console.error("Error updating location:", error);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

        if (!jsonData || jsonData.length === 0) {
          alert('The Excel file appears to be empty.');
          return;
        }

        let createdCount = 0;
        let skippedCount = 0;

        for (const row of jsonData) {
          // Normalize keys to lowercase and remove all non-alphanumeric characters to handle different header naming
          const normalizedRow: any = {};
          Object.keys(row).forEach(key => {
            const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
            normalizedRow[normalizedKey] = row[key];
          });

          // Expanded aliases for Location Name
          const name = normalizedRow.name || 
                       normalizedRow.locationname || 
                       normalizedRow.location || 
                       normalizedRow.area || 
                       normalizedRow.storagearea ||
                       normalizedRow.room ||
                       normalizedRow.zone;

          // Expanded aliases for Location Number/ID
          const number = normalizedRow.locationnumber || 
                         normalizedRow.number || 
                         normalizedRow.id || 
                         normalizedRow.code ||
                         normalizedRow.roomnumber ||
                         normalizedRow.locid;

          if (name) {
            await addDoc(collection(db, 'locations'), {
              name: String(name).trim(),
              locationNumber: number?.toString().trim() || Math.floor(1000 + Math.random() * 9000).toString(),
              createdAt: serverTimestamp()
            });
            createdCount++;
          } else {
            skippedCount++;
          }
        }
        
        if (createdCount > 0) {
          alert(`Successfully imported ${createdCount} locations.${skippedCount > 0 ? ` Skipped ${skippedCount} rows due to missing name.` : ''}`);
        } else {
          alert('No valid locations found. Please ensure your Excel has a "Name" or "Location" column.');
        }
      } catch (error) {
        console.error("Upload error:", error);
        alert('Error processing file. Please ensure it is a valid Excel document (.xlsx or .xls).');
      } finally {
        setIsUploading(false);
        // Reset the input so the same file can be uploaded again if needed
        e.target.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const downloadQR = (id: string, name: string) => {
    const svg = document.getElementById(`qr-${id}`);
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.download = `QR-${name}.png`;
      downloadLink.href = `${pngFile}`;
      downloadLink.click();
    };
    img.src = `data:image/svg+xml;base64,${btoa(svgData)}`;
  };

  const filteredLocations = locations.filter(loc => 
    loc.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 transition-colors duration-300">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl font-bold text-stone-900 dark:text-white tracking-tight">Storage Locations</h2>
          <p className="text-stone-500 dark:text-stone-400 mt-2">Manage physical areas and generate QR codes for quick access.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <label className="cursor-pointer flex items-center gap-2 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 px-6 py-3 rounded-2xl text-sm font-semibold text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800 transition-all shadow-sm">
            <FileSpreadsheet className="w-4 h-4 text-green-600" />
            {isUploading ? 'Uploading...' : 'Bulk Import Excel'}
            <input type="file" className="hidden" accept=".xlsx, .xls" onChange={handleFileUpload} disabled={isUploading} />
          </label>
          <button 
            onClick={() => setIsAddingLocation(true)}
            className="flex items-center gap-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 px-6 py-3 rounded-2xl text-sm font-semibold hover:bg-stone-800 dark:hover:bg-white transition-all shadow-lg shadow-stone-200 dark:shadow-none"
          >
            <Plus className="w-4 h-4" />
            New Location
          </button>
        </div>
      </header>

      {/* Modal for adding new location */}
      {isAddingLocation && (
        <div className="fixed inset-0 bg-stone-900/40 dark:bg-stone-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-6">
          <div className="bg-white dark:bg-stone-900 rounded-[32px] p-10 max-w-md w-full shadow-2xl shadow-stone-900/20 border border-stone-100 dark:border-stone-800">
            <h3 className="text-2xl font-bold text-stone-900 dark:text-white mb-2">Add New Location</h3>
            <p className="text-stone-500 dark:text-stone-400 mb-8">Enter a name for the new storage area.</p>
            
            <form onSubmit={handleAddLocation} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-2">Location Name</label>
                  <input
                    autoFocus
                    type="text"
                    placeholder="e.g., Main Warehouse A"
                    className="w-full px-6 py-4 bg-stone-50 dark:bg-stone-800 border-none rounded-2xl text-sm focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700 text-stone-900 dark:text-white placeholder:text-stone-400 dark:placeholder:text-stone-600 transition-all"
                    value={newLocationName}
                    onChange={(e) => setNewLocationName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-2">Location ID #</label>
                  <input
                    type="text"
                    placeholder="e.g., 101"
                    className="w-full px-6 py-4 bg-stone-50 dark:bg-stone-800 border-none rounded-2xl text-sm focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700 text-stone-900 dark:text-white placeholder:text-stone-400 dark:placeholder:text-stone-600 transition-all"
                    value={newLocationNumber}
                    onChange={(e) => setNewLocationNumber(e.target.value)}
                  />
                </div>
              </div>
              
              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setIsAddingLocation(false)}
                  className="flex-1 px-6 py-4 rounded-2xl text-sm font-semibold text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 px-6 py-4 rounded-2xl text-sm font-semibold hover:bg-stone-800 dark:hover:bg-white transition-all shadow-lg shadow-stone-200 dark:shadow-none"
                >
                  Create Location
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal for editing location */}
      {editingLocation && (
        <div className="fixed inset-0 bg-stone-900/40 dark:bg-stone-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-6">
          <div className="bg-white dark:bg-stone-900 rounded-[32px] p-10 max-w-md w-full shadow-2xl shadow-stone-900/20 border border-stone-100 dark:border-stone-800">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-2xl font-bold text-stone-900 dark:text-white">Edit Location</h3>
              <button onClick={() => setEditingLocation(null)} className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200">
                <X className="w-6 h-6" />
              </button>
            </div>
            <p className="text-stone-500 dark:text-stone-400 mb-8">Update the details for this storage area.</p>
            
            <form onSubmit={handleEditLocation} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-2">Location Name</label>
                  <input
                    autoFocus
                    type="text"
                    className="w-full px-6 py-4 bg-stone-50 dark:bg-stone-800 border-none rounded-2xl text-sm focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700 text-stone-900 dark:text-white placeholder:text-stone-400 dark:placeholder:text-stone-600 transition-all"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-2">Location ID #</label>
                  <input
                    type="text"
                    className="w-full px-6 py-4 bg-stone-50 dark:bg-stone-800 border-none rounded-2xl text-sm focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700 text-stone-900 dark:text-white placeholder:text-stone-400 dark:placeholder:text-stone-600 transition-all"
                    value={editNumber}
                    onChange={(e) => setEditNumber(e.target.value)}
                  />
                </div>
              </div>
              
              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingLocation(null)}
                  className="flex-1 px-6 py-4 rounded-2xl text-sm font-semibold text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 px-6 py-4 rounded-2xl text-sm font-semibold hover:bg-stone-800 dark:hover:bg-white transition-all shadow-lg shadow-stone-200 dark:shadow-none"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-stone-900 rounded-[32px] border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-stone-100 dark:border-stone-800">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 dark:text-stone-500" />
                <input
                  type="text"
                  placeholder="Search locations..."
                  className="w-full pl-12 pr-4 py-3 bg-stone-50 dark:bg-stone-800 border-none rounded-2xl text-sm focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700 text-stone-900 dark:text-white placeholder:text-stone-400 dark:placeholder:text-stone-600 transition-all"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-6">
              {filteredLocations.map((loc) => (
                <div 
                  key={loc.id} 
                  onClick={() => setSelectedLocation(loc)}
                  className={`p-6 rounded-[24px] border transition-all cursor-pointer flex items-center justify-between group ${
                    selectedLocation?.id === loc.id 
                      ? "bg-stone-900 dark:bg-stone-100 border-stone-900 dark:border-stone-100 text-white dark:text-stone-900 shadow-lg shadow-stone-200 dark:shadow-none" 
                      : "bg-white dark:bg-stone-900 border-stone-100 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-600 text-stone-900 dark:text-white"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${
                      selectedLocation?.id === loc.id ? "bg-stone-800 dark:bg-stone-200" : "bg-stone-50 dark:bg-stone-800"
                    }`}>
                      <MapPin className={`w-6 h-6 ${selectedLocation?.id === loc.id ? "text-white dark:text-stone-900" : "text-stone-400 dark:text-stone-500"}`} />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg leading-tight">{loc.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <p className={`text-xs font-bold ${selectedLocation?.id === loc.id ? "text-stone-300 dark:text-stone-600" : "text-stone-600 dark:text-stone-300"}`}>
                          #{loc.locationNumber || '---'}
                        </p>
                        <span className="text-[10px] text-stone-400">•</span>
                        <p className={`text-xs ${selectedLocation?.id === loc.id ? "text-stone-400 dark:text-stone-500" : "text-stone-500 dark:text-stone-400"}`}>
                          ID: {loc.id.slice(0, 8)}
                        </p>
                        <span className="text-[10px] text-stone-400">•</span>
                        <p className={`text-xs font-bold ${selectedLocation?.id === loc.id ? "text-stone-300 dark:text-stone-600" : "text-stone-600 dark:text-stone-300"}`}>
                          {stockCounts[loc.id] || 0} items
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingLocation(loc);
                        setEditName(loc.name);
                        setEditNumber(loc.locationNumber || '');
                      }}
                      className={`p-2 rounded-xl transition-colors ${
                        selectedLocation?.id === loc.id ? "text-stone-400 dark:text-stone-500 hover:bg-stone-800 dark:hover:bg-stone-200" : "text-stone-300 dark:text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-600 dark:hover:text-stone-300"
                      }`}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setLocationToDelete(loc);
                      }}
                      className={`p-2 rounded-xl transition-colors ${
                        selectedLocation?.id === loc.id ? "text-stone-400 dark:text-stone-500 hover:bg-stone-800 dark:hover:bg-stone-200" : "text-stone-300 dark:text-stone-600 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400"
                      }`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <QrCode className={`w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity ${
                      selectedLocation?.id === loc.id ? "text-stone-400 dark:text-stone-500" : "text-stone-300 dark:text-stone-600"
                    }`} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          {selectedLocation ? (
            <div className="bg-white dark:bg-stone-900 rounded-[32px] border border-stone-100 dark:border-stone-800 shadow-sm p-8 text-center sticky top-8">
              <div className="w-16 h-16 bg-stone-900 dark:bg-stone-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <QrCode className="w-8 h-8 text-white dark:text-stone-900" />
              </div>
              <h3 className="text-2xl font-bold text-stone-900 dark:text-white mb-2">{selectedLocation.name}</h3>
              <p className="text-stone-500 dark:text-stone-400 text-sm mb-8">Scan this QR code to check items in or out of this location.</p>
              
              <div id="qr-container" className="bg-stone-50 dark:bg-stone-800 p-8 rounded-[32px] inline-block mb-8 border border-stone-100 dark:border-stone-700">
                <div className="hidden print:block text-center mb-4">
                  <h2 className="text-2xl font-bold dark:text-white">{selectedLocation.name}</h2>
                  <p className="text-sm text-stone-500 dark:text-stone-400">OmniStock Inventory Location</p>
                </div>
                <QRCodeSVG 
                  id={`qr-${selectedLocation.id}`}
                  value={selectedLocation.id} 
                  size={200}
                  level="H"
                  includeMargin={true}
                  bgColor="transparent"
                  fgColor="currentColor"
                  className="text-stone-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => downloadQR(selectedLocation.id, selectedLocation.name)}
                  className="flex items-center justify-center gap-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 py-4 px-6 rounded-2xl font-semibold hover:bg-stone-800 dark:hover:bg-white transition-all shadow-lg shadow-stone-200 dark:shadow-none"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
                <button 
                  onClick={() => window.print()}
                  className="flex items-center justify-center gap-2 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 py-4 px-6 rounded-2xl font-semibold hover:bg-stone-50 dark:hover:bg-stone-700 transition-all"
                >
                  Print Label
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-stone-900 rounded-[32px] border border-stone-100 dark:border-stone-800 shadow-sm p-12 text-center flex flex-col items-center justify-center h-full min-h-[400px]">
              <div className="w-20 h-20 bg-stone-50 dark:bg-stone-800 rounded-full flex items-center justify-center mb-6">
                <QrCode className="w-10 h-10 text-stone-300 dark:text-stone-600" />
              </div>
              <h3 className="text-xl font-bold text-stone-900 dark:text-white mb-2">No Location Selected</h3>
              <p className="text-stone-500 dark:text-stone-400 text-sm max-w-[200px]">Select a location from the list to view and download its QR code.</p>
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={!!locationToDelete}
        onClose={() => setLocationToDelete(null)}
        onConfirm={confirmDeleteLocation}
        title="Delete Location"
        message={`Are you sure you want to delete "${locationToDelete?.name}"? This action cannot be undone and will affect stock records associated with this location.`}
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}
