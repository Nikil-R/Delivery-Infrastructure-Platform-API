import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import { ArrowLeft, Play, Send } from 'lucide-react';
import { driverIcon } from '../utils/leafletIcons';

const Simulator: React.FC = () => {
  // App Configs
  const [serverUrl, setServerUrl] = useState(() => localStorage.getItem('dep_server_url') || (window.location.origin.includes('localhost:5173') ? 'http://localhost:8000' : window.location.origin));
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('dep_api_key') || 'test_api_key_123');

  // Simulator State
  const [driverId, setDriverId] = useState<number | ''>('');
  const [driver, setDriver] = useState<any>(null);
  const [markerPos, setMarkerPos] = useState<{ lat: number; lng: number }>({ lat: 12.9716, lng: 77.5946 });
  const [newDriverName, setNewDriverName] = useState('');
  const [newDriverPhone, setNewDriverPhone] = useState('');
  // UI Status
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [activeOffer, setActiveOffer] = useState<any>(null);
  const [manualOrderId, setManualOrderId] = useState<number | ''>('');

  React.useEffect(() => {
    if (!driver) {
      setActiveOffer(null);
      return;
    }

    const checkOffers = async () => {
      try {
        const res = await fetch(`${serverUrl}/drivers/${driver.id}/offers`);
        if (res.ok) {
          const offer = await res.json();
          if (offer && offer.id) {
            setActiveOffer(offer);
            setManualOrderId(offer.id);
          } else {
            setActiveOffer(null);
          }
        }
      } catch (err) {}
    };

    checkOffers();
    const interval = setInterval(checkOffers, 4000);
    return () => clearInterval(interval);
  }, [driver, serverUrl]);

  // Hook to handle map click events to place driver target marker
  const MapEvents = () => {
    useMapEvents({
      click(e: any) {
        setMarkerPos({ lat: e.latlng.lat, lng: e.latlng.lng });
        setLog((prev) => [
          `[Simulator] Marker moved to: ${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}. Click "Send GPS Ping" to broadcast.`,
          ...prev
        ]);
      }
    });
    return null;
  };

  // 1. Register a new driver
  const handleRegisterDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDriverName || !newDriverPhone) return;

    try {
      setError(null);
      const res = await fetch(`${serverUrl}/drivers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newDriverName, phone: newDriverPhone })
      });
      if (!res.ok) throw new Error('Registration failed');
      const data = await res.json();
      setDriver(data);
      setDriverId(data.id);
      if (data.current_lat && data.current_lng) {
        setMarkerPos({ lat: data.current_lat, lng: data.current_lng });
      }
      setLog((prev) => [`[System] Registered Driver "${data.name}" with ID: ${data.id}`, ...prev]);
      setNewDriverName('');
      setNewDriverPhone('');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    }
  };

  // 2. Load Driver
  const handleLoadDriver = async () => {
    if (!driverId) return;
    try {
      setError(null);
      const res = await fetch(`${serverUrl}/drivers/${driverId}`);
      if (!res.ok) throw new Error('Driver not found');
      const data = await res.json();
      setDriver(data);
      if (data.current_lat && data.current_lng) {
        setMarkerPos({ lat: data.current_lat, lng: data.current_lng });
      }
      setLog((prev) => [`[System] Loaded Driver Profile ID: ${data.id} (${data.name})`, ...prev]);
    } catch (err: any) {
      setError(err.message || 'Driver profile load failed');
    }
  };

  // 3. Send manual location heartbeat
  const handleSendLocation = async () => {
    if (!driver) return;
    try {
      setError(null);
      const res = await fetch(`${serverUrl}/drivers/${driver.id}/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude: markerPos.lat, longitude: markerPos.lng })
      });
      if (!res.ok) throw new Error('Failed to update location');
      
      setLog((prev) => [
        `[Broadcast] Posted GPS telemetry: [${markerPos.lat.toFixed(5)}, ${markerPos.lng.toFixed(5)}] for Driver #${driver.id}`,
        ...prev
      ]);
    } catch (err: any) {
      setError(err.message || 'Failed to update location');
    }
  };

  // 4. Toggle Availability
  const handleToggleAvailability = async (val: boolean) => {
    if (!driver) return;
    try {
      setError(null);
      const res = await fetch(`${serverUrl}/drivers/${driver.id}/availability`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_available: val })
      });
      if (!res.ok) throw new Error('Failed to update availability status');
      
      setDriver((prev: any) => ({ ...prev, is_available: val }));
      setLog((prev) => [`[System] Availability toggled: ${val ? 'AVAILABLE (GEO Search Active)' : 'OFFLINE'}`, ...prev]);
    } catch (err: any) {
      setError(err.message || 'Availability toggle failed');
    }
  };

  // 5. Manual Order Status Actions
  const handleManualStatusChange = async (status: string) => {
    if (!manualOrderId) return;
    try {
      setError(null);
      const res = await fetch(`${serverUrl}/deliveries/${manualOrderId}/status`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'X-API-Key': apiKey 
        },
        body: JSON.stringify({ 
          status,
          driver_id: driver?.id
        })
      });
      if (!res.ok) throw new Error(`Transition to ${status} failed`);
      const data = await res.json();
      setLog((prev) => [`[Order #${data.id}] Status transitioned to: ${data.status}`, ...prev]);
      
      if (status === 'DELIVERED') {
        setManualOrderId('');
      }
      if (driver) {
        refreshDriverProfile(driver.id);
      }
    } catch (err: any) {
      setError(err.message || 'Transition update failed');
    }
  };

  const refreshDriverProfile = async (id: number) => {
    try {
      const res = await fetch(`${serverUrl}/drivers/${id}`);
      if (res.ok) {
        const data = await res.json();
        setDriver(data);
      }
    } catch (err) {}
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#111827] flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-[#EAE6DF] bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link to="/" className="p-2 hover:bg-[#FAF8F5] rounded-xl text-[#6B7280] hover:text-[#111827] transition-colors border border-transparent hover:border-[#EAE6DF]">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex items-center space-x-2">
              <Play className="w-5 h-5 text-indigo-600 animate-pulse" />
              <span className="font-semibold text-base">Driver GPS & Dispatch Simulator</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-grow max-w-7xl mx-auto w-full px-6 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Control Panel */}
        <div className="lg:col-span-1 space-y-6">
          {/* Server Config */}
          <div className="p-5 bg-white border border-[#EAE6DF] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Connection Settings</h2>
            <div>
              <label className="text-[10px] text-[#6B7280] block mb-0.5 font-medium uppercase tracking-wider">Gateway API URL</label>
              <input 
                type="text" 
                value={serverUrl} 
                onChange={(e) => setServerUrl(e.target.value)} 
                className="w-full px-2.5 py-1.5 bg-[#FAF8F5] border border-[#EAE6DF] rounded-md text-[#111827] focus:outline-none font-mono text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] text-[#6B7280] block mb-0.5 font-medium uppercase tracking-wider">Tenant Auth Token</label>
              <input 
                type="text" 
                value={apiKey} 
                onChange={(e) => setApiKey(e.target.value)} 
                className="w-full px-2.5 py-1.5 bg-[#FAF8F5] border border-[#EAE6DF] rounded-md text-[#111827] focus:outline-none font-mono text-xs"
              />
            </div>
          </div>

          {/* Load / Create Driver */}
          <div className="p-5 bg-white border border-[#EAE6DF] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Driver Access Control</h2>
            
            {/* Load existing */}
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Driver ID"
                value={driverId}
                onChange={(e) => setDriverId(e.target.value ? Number(e.target.value) : '')}
                className="w-20 px-2.5 py-1.5 bg-[#FAF8F5] border border-[#EAE6DF] rounded-lg text-center text-xs font-mono text-[#111827] focus:outline-none"
              />
              <button
                onClick={handleLoadDriver}
                className="flex-grow py-2 px-3 bg-[#FAF8F5] hover:bg-white border border-[#EAE6DF] hover:border-indigo-400 font-semibold text-xs rounded-lg text-[#111827] transition-all cursor-pointer"
              >
                Load Driver Profile
              </button>
            </div>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-[#EAE6DF]"></div>
              <span className="flex-shrink mx-3 text-[9px] text-[#9CA3AF] font-bold uppercase tracking-wider">or Register New</span>
              <div className="flex-grow border-t border-[#EAE6DF]"></div>
            </div>

            {/* Create new */}
            <form onSubmit={handleRegisterDriver} className="space-y-2.5">
              <input
                type="text"
                placeholder="Driver Name"
                value={newDriverName}
                onChange={(e) => setNewDriverName(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-[#FAF8F5] border border-[#EAE6DF] rounded-lg text-xs text-[#111827] focus:outline-none"
              />
              <input
                type="text"
                placeholder="Driver Phone Number"
                value={newDriverPhone}
                onChange={(e) => setNewDriverPhone(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-[#FAF8F5] border border-[#EAE6DF] rounded-lg text-xs text-[#111827] focus:outline-none font-mono"
              />
              <button
                type="submit"
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold rounded-lg text-white transition-all shadow-[0_1px_2px_rgba(0,0,0,0.05)] cursor-pointer"
              >
                Register Driver
              </button>
            </form>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-medium">
              {error}
            </div>
          )}

          {/* Active Driver Actions */}
          {driver && (
            <div className="p-5 bg-white border border-[#EAE6DF] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-4">
              <div className="flex justify-between items-center pb-3 border-b border-[#EAE6DF]">
                <div>
                  <h3 className="font-semibold text-[#111827] text-sm">{driver.name}</h3>
                  <p className="text-[10px] text-[#6B7280] font-medium font-mono">Profile ID: #{driver.id}</p>
                </div>
                <div className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                  driver.status === 'ONLINE' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-150 text-gray-600'
                }`}>
                  {driver.status}
                </div>
              </div>

              {/* Active Offer Alert Banner */}
              {activeOffer && (
                <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg space-y-2.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">Proposed Order Offer!</span>
                    <span className="text-[10px] font-mono bg-indigo-100 text-indigo-750 px-2 py-0.5 rounded font-bold">#{activeOffer.id}</span>
                  </div>
                  <p className="text-[10px] text-[#6B7280] leading-relaxed font-mono">
                    Pickup: {activeOffer.pickup_lat.toFixed(4)}, {activeOffer.pickup_lng.toFixed(4)}<br />
                    Dropoff: {activeOffer.dropoff_lat.toFixed(4)}, {activeOffer.dropoff_lng.toFixed(4)}
                  </p>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={async () => {
                        try {
                          setError(null);
                          const res = await fetch(`${serverUrl}/deliveries/${activeOffer.id}/accept`, {
                            method: 'POST',
                            headers: { 
                              'Content-Type': 'application/json',
                              'X-API-Key': apiKey 
                            }
                          });
                          if (!res.ok) throw new Error('Accept offer failed');
                          const data = await res.json();
                          setLog((prev) => [`[Order #${data.id}] Offer ACCEPTED by driver`, ...prev]);
                          setActiveOffer(null);
                          refreshDriverProfile(driver.id);
                        } catch (err: any) {
                          setError(err.message || 'Accept failed');
                        }
                      }}
                      className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 font-semibold text-xs rounded-lg text-white transition-all cursor-pointer"
                    >
                      Accept
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          setError(null);
                          const res = await fetch(`${serverUrl}/deliveries/${activeOffer.id}/reject`, {
                            method: 'POST',
                            headers: { 
                              'Content-Type': 'application/json',
                              'X-API-Key': apiKey 
                            }
                          });
                          if (!res.ok) throw new Error('Reject offer failed');
                          const data = await res.json();
                          setLog((prev) => [`[Order #${data.id}] Offer REJECTED by driver`, ...prev]);
                          setActiveOffer(null);
                          refreshDriverProfile(driver.id);
                        } catch (err: any) {
                          setError(err.message || 'Reject failed');
                        }
                      }}
                      className="py-1.5 px-3 bg-rose-600 hover:bg-rose-700 font-semibold text-xs rounded-lg text-white transition-all cursor-pointer"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              )}

              {/* Toggles */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#6B7280] font-medium">Availability for assignments:</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={driver.is_available} 
                    onChange={(e) => handleToggleAvailability(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {/* Coordinates info */}
              <div className="bg-[#FAF8F5] p-4 border border-[#EAE6DF] rounded-xl space-y-2.5">
                <span className="text-[10px] text-[#6B7280] uppercase font-bold tracking-wider">Simulator Target Pin</span>
                <div className="flex justify-between items-center text-[10px] font-mono text-[#4B5563]">
                  <span>Lat: {markerPos.lat.toFixed(6)}</span>
                  <span>Lng: {markerPos.lng.toFixed(6)}</span>
                </div>
                <button
                  onClick={handleSendLocation}
                  className="w-full mt-1.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg flex items-center justify-center space-x-2 transition-all cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send GPS Ping Update</span>
                </button>
              </div>

              {/* Manual Order Controls */}
              <div className="border-t border-[#EAE6DF] pt-4 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Manual Dispatch Override</h3>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Order ID"
                    value={manualOrderId}
                    onChange={(e) => setManualOrderId(e.target.value ? Number(e.target.value) : '')}
                    className="w-16 px-2 py-1.5 bg-[#FAF8F5] border border-[#EAE6DF] rounded-lg text-xs font-mono text-center text-[#111827] focus:outline-none"
                  />
                  <button
                    onClick={() => handleManualStatusChange('ASSIGNED')}
                    className="flex-grow py-1.5 px-3 bg-[#FAF8F5] hover:bg-white border border-[#EAE6DF] hover:border-indigo-400 font-semibold text-[10px] rounded-lg text-[#111827] cursor-pointer"
                  >
                    Force Assign
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => handleManualStatusChange('PICKED_UP')}
                    className="py-1.5 px-1 bg-[#FAF8F5] hover:bg-white border border-[#EAE6DF] hover:border-indigo-400 font-semibold text-[10px] rounded-lg text-[#4B5563] cursor-pointer"
                  >
                    Pick Up
                  </button>
                  <button
                    onClick={() => handleManualStatusChange('IN_TRANSIT')}
                    className="py-1.5 px-1 bg-[#FAF8F5] hover:bg-white border border-[#EAE6DF] hover:border-indigo-400 font-semibold text-[10px] rounded-lg text-[#4B5563] cursor-pointer"
                  >
                    In Transit
                  </button>
                  <button
                    onClick={() => handleManualStatusChange('DELIVERED')}
                    className="py-1.5 px-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[10px] rounded-lg cursor-pointer"
                  >
                    Deliver
                  </button>
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Right Side: Map & Logger */}
        <div className="lg:col-span-2 flex flex-col space-y-6">
          <div className="h-[450px] relative rounded-xl overflow-hidden border border-[#EAE6DF] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <div className="absolute top-3 left-12 z-20 bg-white/95 border border-[#EAE6DF] px-3 py-1.5 rounded-lg text-[10px] font-medium text-[#4B5563] shadow-md">
              🖱️ Click anywhere on the map to place the driver target destination pin.
            </div>
            
            <MapContainer center={[12.9716, 77.5946]} zoom={13} className="w-full h-full">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              />
              <MapEvents />
              <Marker position={[markerPos.lat, markerPos.lng]} icon={driverIcon} />
            </MapContainer>
          </div>

          {/* Simulator logs */}
          <div className="p-5 bg-white border border-[#EAE6DF] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] flex flex-col h-[200px]">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#6B7280] pb-2 border-b border-[#EAE6DF] mb-3">Simulator Output Console</h2>
            <div className="flex-grow overflow-y-auto bg-[#FAF8F5] border border-[#EAE6DF] rounded-lg p-3 font-mono text-[10px] space-y-1.5 text-[#4B5563]">
              {log.length === 0 ? (
                <div className="text-[#9CA3AF] text-center py-12">Waiting for simulation events...</div>
              ) : (
                log.map((entry, index) => (
                  <div key={index} className="border-l-2 border-indigo-200 pl-2 leading-relaxed">
                    {entry}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Simulator;
