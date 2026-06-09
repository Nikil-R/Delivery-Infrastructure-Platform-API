import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import { ArrowLeft, Clock, MapPin, Wifi, AlertTriangle, RefreshCw, Navigation, Compass } from 'lucide-react';
import { driverIcon, shopIcon, dropoffIcon } from '../utils/leafletIcons';

// Sub-component to recenter and fit map bounds to pickup, dropoff and driver coordinates
const MapController: React.FC<{ order: any; driverLoc: { lat: number; lng: number } | null }> = ({ order, driverLoc }) => {
  const map = useMap();
  useEffect(() => {
    if (order) {
      const points: [number, number][] = [
        [order.pickup_lat, order.pickup_lng],
        [order.dropoff_lat, order.dropoff_lng]
      ];
      if (driverLoc) {
        points.push([driverLoc.lat, driverLoc.lng]);
      }
      map.fitBounds(points, { padding: [50, 50], maxZoom: 15 });
    }
  }, [order, driverLoc, map]);
  return null;
};

const Tracking: React.FC = () => {
  const { deliveryId } = useParams<{ deliveryId: string }>();
  const [order, setOrder] = useState<any>(null);
  const [driverLoc, setDriverLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const [etaData, setEtaData] = useState<{ eta_minutes: number; distance_meters: number } | null>(null);
  const [transitions, setTransitions] = useState<any[]>([]);
  const [routeGeometry, setRouteGeometry] = useState<[number, number][] | null>(null);

  // App Configs
  const [serverUrl, setServerUrl] = useState(() => localStorage.getItem('dep_server_url') || 'http://localhost:8000');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('dep_api_key') || 'test_api_key_123');

  // Save configs
  useEffect(() => {
    localStorage.setItem('dep_server_url', serverUrl);
    localStorage.setItem('dep_api_key', apiKey);
  }, [serverUrl, apiKey]);

  // Fetch transitions
  const fetchTransitions = async () => {
    if (!deliveryId) return;
    try {
      const res = await fetch(`${serverUrl}/deliveries/${deliveryId}/transitions`, {
        headers: { 'X-API-Key': apiKey }
      });
      if (res.ok) {
        const data = await res.json();
        setTransitions(data);
      }
    } catch (err) {}
  };

  // Fetch ETA / distance details
  const fetchEta = async () => {
    if (!deliveryId) return;
    try {
      const res = await fetch(`${serverUrl}/deliveries/${deliveryId}/eta`, {
        headers: { 'X-API-Key': apiKey }
      });
      if (res.ok) {
        const data = await res.json();
        setEtaData({
          eta_minutes: data.eta_minutes,
          distance_meters: data.distance_meters
        });
      } else {
        setEtaData(null);
      }
    } catch (err) {
      setEtaData(null);
    }
  };

  // Fetch route geometry
  const fetchRoute = async () => {
    if (!deliveryId) return;
    try {
      const res = await fetch(`${serverUrl}/deliveries/${deliveryId}/route`, {
        headers: { 'X-API-Key': apiKey }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.geometry) {
          setRouteGeometry(data.geometry);
        }
      }
    } catch (err) {}
  };

  // 1. Fetch initial order details
  const fetchOrder = async () => {
    try {
      setError(null);
      const res = await fetch(`${serverUrl}/deliveries/${deliveryId}`, {
        headers: { 'X-API-Key': apiKey }
      });
      if (!res.ok) {
        throw new Error(`Failed to load order info (Status: ${res.status})`);
      }
      const data = await res.json();
      setOrder(data);
      
      // If driver is already assigned and has location, set it
      if (data.driver_id) {
        const driverRes = await fetch(`${serverUrl}/drivers/${data.driver_id}`);
        if (driverRes.ok) {
          const driverData = await driverRes.json();
          if (driverData.current_lat && driverData.current_lng) {
            setDriverLoc({ lat: driverData.current_lat, lng: driverData.current_lng });
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Error occurred');
    }
  };

  const syncAllData = () => {
    fetchOrder();
    fetchTransitions();
    fetchEta();
    fetchRoute();
  };

  useEffect(() => {
    if (deliveryId) {
      syncAllData();
    }
  }, [deliveryId, serverUrl, apiKey]);

  // Periodic polling for ETA and transitions
  useEffect(() => {
    if (!deliveryId) return;
    const interval = setInterval(() => {
      fetchEta();
      fetchTransitions();
    }, 6000);
    return () => clearInterval(interval);
  }, [deliveryId, serverUrl, apiKey]);

  // 2. Establish WebSocket tracking subscription
  useEffect(() => {
    if (!deliveryId) return;

    const wsUrl = serverUrl.replace(/^http/, 'ws') + `/track/${deliveryId}`;
    setWsStatus('connecting');
    
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      setWsStatus('disconnected');
      return;
    }

    ws.onopen = () => {
      setWsStatus('connected');
      setLogs((prev) => [`[${new Date().toLocaleTimeString()}] Subscribed to telemetry updates`, ...prev]);
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.lat && payload.lng) {
          setDriverLoc({ lat: payload.lat, lng: payload.lng });
          // Fetch route geometry and ETA again on driver moves
          fetchRoute();
          fetchEta();
        }
        if (payload.status) {
          setOrder(prev => prev ? { ...prev, status: payload.status } : null);
          fetchTransitions();
        }
        setLogs((prev) => [
          `[${new Date().toLocaleTimeString()}] Broadcast: ${JSON.stringify(payload)}`,
          ...prev.slice(0, 30)
        ]);
      } catch (e) {
        console.error(e);
      }
    };

    ws.onclose = () => {
      setWsStatus('disconnected');
      setLogs((prev) => [`[${new Date().toLocaleTimeString()}] Telemetry feed disconnected`, ...prev]);
    };

    ws.onerror = () => {
      setWsStatus('disconnected');
    };

    return () => {
      ws.close();
    };
  }, [deliveryId, serverUrl]);

  const mapCenter: [number, number] = order 
    ? [order.pickup_lat, order.pickup_lng] 
    : [12.9716, 77.5946];

  // Helper to format timestamps for transitions
  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) {
      return '';
    }
  };

  // Combine standard statuses to construct a complete timeline
  const statuses = [
    { key: 'CREATED', label: 'Created' },
    { key: 'DRIVER_PENDING', label: 'Finding Driver' },
    { key: 'ASSIGNED', label: 'Driver Assigned' },
    { key: 'PICKED_UP', label: 'Picked Up' },
    { key: 'IN_TRANSIT', label: 'In Transit' },
    { key: 'DELIVERED', label: 'Delivered' }
  ];

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#111827] flex flex-col font-sans">
      {/* Top Header */}
      <header className="border-b border-[#EAE6DF] bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link to="/fleet" className="p-2 hover:bg-[#FAF8F5] rounded-xl text-[#6B7280] hover:text-[#111827] transition-colors border border-transparent hover:border-[#EAE6DF]">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <span className="font-semibold text-base">Tracking Order #{deliveryId}</span>
          </div>

          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#FAF8F5] border border-[#EAE6DF]">
              <span className={`w-2 h-2 rounded-full ${wsStatus === 'connected' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              <span className="text-[#6B7280]">Live Connection</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <div className="flex-grow max-w-7xl mx-auto w-full px-6 py-6 flex flex-col space-y-6">
        
        {/* ETA & Distance Card overlay (At the top of page) */}
        {etaData && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white p-5 border border-[#EAE6DF] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs text-[#6B7280] font-medium uppercase tracking-wider block">Estimated Arrival</span>
                <span className="text-2xl font-bold tracking-tight">{Math.ceil(etaData.eta_minutes)} mins</span>
              </div>
            </div>

            <div className="flex items-center space-x-4 border-t sm:border-t-0 sm:border-l border-[#EAE6DF] pt-4 sm:pt-0 sm:pl-6">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
                <Compass className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs text-[#6B7280] font-medium uppercase tracking-wider block">Distance Remaining</span>
                <span className="text-2xl font-bold tracking-tight">{(etaData.distance_meters / 1000).toFixed(1)} km</span>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-grow items-stretch">
          
          {/* Left Column: Activity Timeline and config */}
          <div className="space-y-6 lg:col-span-1 flex flex-col">
            
            {/* Credentials / Sync Panel */}
            <div className="p-5 bg-white border border-[#EAE6DF] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
              <div className="flex justify-between items-center pb-2 border-b border-[#EAE6DF] mb-3">
                <h2 className="text-xs font-semibold text-[#111827] uppercase tracking-wider">Order Reference</h2>
                <button 
                  onClick={syncAllData}
                  className="p-1 hover:bg-[#FAF8F5] rounded border border-transparent hover:border-[#EAE6DF] text-[#6B7280] hover:text-[#111827] transition-all"
                  title="Synchronize data"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-2.5 text-xs">
                <div>
                  <label className="text-[10px] text-[#6B7280] block mb-0.5 font-medium uppercase tracking-wider">Server endpoint</label>
                  <input 
                    type="text" 
                    value={serverUrl} 
                    onChange={(e) => setServerUrl(e.target.value)} 
                    className="w-full px-2.5 py-1.5 bg-[#FAF8F5] border border-[#EAE6DF] rounded-md text-[#111827] focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[#6B7280] block mb-0.5 font-medium uppercase tracking-wider">X-API-Key</label>
                  <input 
                    type="text" 
                    value={apiKey} 
                    onChange={(e) => setApiKey(e.target.value)} 
                    className="w-full px-2.5 py-1.5 bg-[#FAF8F5] border border-[#EAE6DF] rounded-md text-[#111827] focus:outline-none font-mono"
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-start space-x-3 text-xs">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Real-time Activity Feed Timeline */}
            <div className="p-5 bg-white border border-[#EAE6DF] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] flex-grow flex flex-col">
              <h2 className="text-xs font-semibold text-[#111827] uppercase tracking-wider pb-2 border-b border-[#EAE6DF] mb-4">Activity Timeline</h2>
              
              <div className="flex-grow overflow-y-auto pr-1">
                {order ? (
                  <div className="flex flex-col space-y-0 text-xs pl-2">
                    {statuses.map((step, idx) => {
                      // Find if this status was reached in transitions
                      const transitionRecord = transitions.find(t => t.to_status === step.key);
                      const isCompleted = !!transitionRecord || order.status === step.key;
                      
                      // Highlight current state
                      const isCurrent = order.status === step.key;
                      
                      return (
                        <div key={step.key} className="flex group">
                          {/* Progress Line/Dot Design */}
                          <div className="flex flex-col items-center mr-4">
                            <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border-2 ${
                              isCurrent ? 'bg-indigo-600 border-indigo-600 animate-pulse' :
                              isCompleted ? 'bg-[#FAF8F5] border-indigo-600' :
                              'bg-white border-[#EAE6DF]'
                            }`}>
                              {isCompleted && !isCurrent && <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full" />}
                            </div>
                            
                            {idx < statuses.length - 1 && (
                              <div className={`w-0.5 flex-grow my-1 min-h-[36px] ${
                                isCompleted ? 'bg-indigo-600/30' : 'bg-[#EAE6DF]'
                              }`} />
                            )}
                          </div>

                          {/* Detail label */}
                          <div className="pb-5 pt-0">
                            <p className={`font-semibold ${isCurrent ? 'text-indigo-600 font-bold text-sm' : isCompleted ? 'text-[#111827]' : 'text-[#9CA3AF]'}`}>
                              {step.label}
                            </p>
                            {transitionRecord && (
                              <span className="text-[10px] text-[#6B7280] font-mono mt-0.5 block">
                                {formatTime(transitionRecord.created_at)}
                              </span>
                            )}
                            {isCurrent && !transitionRecord && (
                              <span className="text-[10px] text-indigo-500 font-semibold block animate-pulse">
                                Active Now
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 text-[#9CA3AF]">
                    Synchronizing status logs...
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Leaflet Map Container */}
          <div className="lg:col-span-2 h-[500px] lg:h-auto min-h-[500px] relative rounded-xl overflow-hidden border border-[#EAE6DF] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex flex-col">
            <div className="flex-grow relative">
              <MapContainer center={mapCenter} zoom={14} className="w-full h-full">
                {/* Light Positron Tile layer */}
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                  url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                />
                
                {order && (
                  <>
                    {/* Pickup marker */}
                    <Marker position={[order.pickup_lat, order.pickup_lng]} icon={shopIcon}>
                      <Popup>
                        <div className="font-sans text-xs">
                          <p className="font-bold text-indigo-600">Pickup Merchant</p>
                        </div>
                      </Popup>
                    </Marker>

                    {/* Dropoff marker */}
                    <Marker position={[order.dropoff_lat, order.dropoff_lng]} icon={dropoffIcon}>
                      <Popup>
                        <div className="font-sans text-xs">
                          <p className="font-bold text-rose-600">Delivery Address</p>
                        </div>
                      </Popup>
                    </Marker>
                  </>
                )}

                {/* Live Driver marker */}
                {driverLoc && (
                  <Marker position={[driverLoc.lat, driverLoc.lng]} icon={driverIcon}>
                    <Popup>
                      <div className="font-sans text-xs">
                        <p className="font-bold text-emerald-600">Courier Active</p>
                        <p className="text-[10px] text-[#6B7280]">Loc: {driverLoc.lat.toFixed(5)}, {driverLoc.lng.toFixed(5)}</p>
                      </div>
                    </Popup>
                  </Marker>
                )}

                {/* Route polyline overlay */}
                {routeGeometry && (
                  <Polyline 
                    positions={routeGeometry} 
                    color="#4f46e5" 
                    weight={4}
                    opacity={0.8}
                    dashArray="5, 10"
                  />
                )}

                {/* Fallback straight line if geometry route is not available */}
                {!routeGeometry && order && (
                  <Polyline 
                    positions={[
                      [order.pickup_lat, order.pickup_lng],
                      [order.dropoff_lat, order.dropoff_lng]
                    ]} 
                    color="#a855f7" 
                    weight={3}
                    opacity={0.5}
                  />
                )}

                {order && (
                  <MapController order={order} driverLoc={driverLoc} />
                )}
              </MapContainer>
            </div>
            
            {/* Live activity log drawer inside map card */}
            <div className="bg-[#FAF8F5] border-t border-[#EAE6DF] p-3 text-[10px] font-mono flex items-center justify-between text-[#6B7280]">
              <div className="flex items-center space-x-1.5">
                <Wifi className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
                <span>WebSocket telemetry: <span className="font-semibold text-[#111827]">{wsStatus}</span></span>
              </div>
              <span className="text-[9px] uppercase tracking-wider font-semibold text-[#9CA3AF]">Real-time pipeline logs active</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default Tracking;
