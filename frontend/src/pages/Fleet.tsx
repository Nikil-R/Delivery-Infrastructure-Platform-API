import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import { ArrowLeft, Monitor, Wifi, Radio, Users, CheckCircle, Navigation, MapPin, Settings, Activity, ShieldAlert, Heart, HardDrive, Cpu, Database } from 'lucide-react';
import { driverIcon, shopIcon, dropoffIcon } from '../utils/leafletIcons';

interface ActiveDriver {
  id: number;
  name: string;
  lat: number;
  lng: number;
  lastPing: string;
  deliveryId?: number;
}

// Controller to auto-center/fit bounds of the map to the selected order coordinates
const MapController: React.FC<{ selectedDelivery: any; driverLoc: { lat: number; lng: number } | null }> = ({ selectedDelivery, driverLoc }) => {
  const map = useMap();
  useEffect(() => {
    if (selectedDelivery) {
      const points: [number, number][] = [
        [selectedDelivery.pickup_lat, selectedDelivery.pickup_lng],
        [selectedDelivery.dropoff_lat, selectedDelivery.dropoff_lng],
      ];
      if (driverLoc) {
        points.push([driverLoc.lat, driverLoc.lng]);
      }
      map.fitBounds(points, { padding: [50, 50], maxZoom: 15 });
    }
  }, [selectedDelivery, driverLoc, map]);
  return null;
};

const Fleet: React.FC = () => {
  const [drivers, setDrivers] = useState<Record<number, ActiveDriver>>({});
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [logs, setLogs] = useState<string[]>([]);
  
  // App Configs
  const [serverUrl, setServerUrl] = useState(() => localStorage.getItem('dep_server_url') || 'http://localhost:8000');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('dep_api_key') || 'test_api_key_123');

  // Form states
  const [pickupLat, setPickupLat] = useState(12.9716);
  const [pickupLng, setPickupLng] = useState(77.5946);
  const [dropoffLat, setDropoffLat] = useState(12.9816);
  const [dropoffLng, setDropoffLng] = useState(77.6046);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<number | null>(null);
  const [routeGeometry, setRouteGeometry] = useState<[number, number][] | null>(null);
  const [systemVitals, setSystemVitals] = useState<any>(null);

  const fetchDeliveries = async () => {
    try {
      const res = await fetch(`${serverUrl}/deliveries`, {
        headers: { 'X-API-Key': apiKey }
      });
      if (res.ok) {
        const data = await res.json();
        setDeliveries(data);
      }
    } catch (err) {}
  };

  const fetchVitals = async () => {
    try {
      const res = await fetch(`${serverUrl}/analytics/observability/vitals`, {
        headers: { 'X-API-Key': apiKey }
      });
      if (res.ok) {
        const data = await res.json();
        setSystemVitals(data);
      }
    } catch (err) {}
  };

  useEffect(() => {
    fetchDeliveries();
    fetchVitals();
    const interval = setInterval(() => {
      fetchDeliveries();
      fetchVitals();
    }, 5000);
    return () => clearInterval(interval);
  }, [serverUrl, apiKey]);

  // Fetch Route Geometry when delivery is selected
  useEffect(() => {
    if (!selectedDeliveryId) {
      setRouteGeometry(null);
      return;
    }
    const fetchRoute = async () => {
      try {
        const res = await fetch(`${serverUrl}/deliveries/${selectedDeliveryId}/route`, {
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
    fetchRoute();
  }, [selectedDeliveryId, serverUrl, apiKey]);

  // Save config
  useEffect(() => {
    localStorage.setItem('dep_server_url', serverUrl);
    localStorage.setItem('dep_api_key', apiKey);
  }, [serverUrl, apiKey]);

  const handleCreateAndDispatch = async () => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      // 1. Create delivery
      const res = await fetch(`${serverUrl}/deliveries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        body: JSON.stringify({
          pickup_lat: pickupLat,
          pickup_lng: pickupLng,
          dropoff_lat: dropoffLat,
          dropoff_lng: dropoffLng
        })
      });
      if (!res.ok) {
        throw new Error(`Failed to create order (Status: ${res.status})`);
      }
      const order = await res.json();
      const orderId = order.id;
      
      setLogs((prev) => [`[System] Created Order #${orderId}. Auto-assigning...`, ...prev]);

      // 2. Trigger auto-assignment
      const assignRes = await fetch(`${serverUrl}/deliveries/assign-driver`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        body: JSON.stringify({ order_id: orderId })
      });
      if (!assignRes.ok) {
        throw new Error(`Failed to trigger auto-assignment (Status: ${assignRes.status})`);
      }
      const assignedOrder = await assignRes.json();
      
      setSuccessMsg(`Order #${orderId} dispatched! Status: ${assignedOrder.status}`);
      setLogs((prev) => [`[System] Order #${orderId} assigned to Driver #${assignedOrder.driver_id || 'None'}`, ...prev]);
      setSelectedDeliveryId(orderId);
      fetchDeliveries();
    } catch (err: any) {
      setError(err.message || 'Dispatch failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const wsUrl = serverUrl.replace(/^http/, 'ws') + '/fleet';
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
      setLogs((prev) => [`[${new Date().toLocaleTimeString()}] Telemetry feed connected`, ...prev]);
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.driver_id && payload.lat && payload.lng) {
          const driverId = Number(payload.driver_id);
          
          setDrivers((prev) => {
            const existing = prev[driverId];
            return {
              ...prev,
              [driverId]: {
                id: driverId,
                name: existing?.name || `Driver #${driverId}`,
                lat: payload.lat,
                lng: payload.lng,
                lastPing: new Date().toLocaleTimeString(),
                deliveryId: payload.delivery_id ? Number(payload.delivery_id) : undefined
              }
            };
          });

          // Print telemetry logs selectively
          if (Math.random() < 0.2) {
            setLogs((prev) => [
              `[${new Date().toLocaleTimeString()}] Driver #${driverId} ping at [${payload.lat.toFixed(5)}, ${payload.lng.toFixed(5)}]`,
              ...prev.slice(0, 50)
            ]);
          }
        }
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
  }, [serverUrl]);

  const driverList = Object.values(drivers);
  const selectedDelivery = deliveries.find(d => d.id === selectedDeliveryId);
  const selectedDriver = selectedDelivery?.driver_id ? drivers[selectedDelivery.driver_id] : null;

  // Determine system health check state
  const isRedisUp = systemVitals ? true : false;
  const isPostgresUp = deliveries ? true : false;
  const isCeleryUp = systemVitals && systemVitals.queues ? true : false;
  const isWsUp = wsStatus === 'connected';

  const queueBacklog = (systemVitals?.queues?.notifications || 0) + (systemVitals?.queues?.analytics || 0);
  const dlqCount = systemVitals?.queues?.dead_letter_queue || 0;

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
              <Monitor className="w-5 h-5 text-indigo-600" />
              <span className="font-semibold text-base tracking-tight">Fleet Operations Command</span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#FAF8F5] border border-[#EAE6DF]`}>
              <span className={`w-2 h-2 rounded-full ${wsStatus === 'connected' ? 'bg-emerald-500 animate-pulse' : wsStatus === 'connecting' ? 'bg-amber-500' : 'bg-rose-500'}`} />
              <span className="text-[#6B7280]">Telemetry Stream: <span className="font-semibold text-[#111827]">{wsStatus}</span></span>
            </div>
          </div>
        </div>
      </header>

      {/* Grid Layout: Top stats dashboard */}
      <div className="max-w-7xl mx-auto w-full px-6 pt-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 border border-[#EAE6DF] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <span className="text-xs text-[#6B7280] font-medium uppercase tracking-wider block mb-1">Online Fleet</span>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-bold tracking-tight">{driverList.length}</span>
              <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-1.5 py-0.5 rounded">Active</span>
            </div>
          </div>

          <div className="bg-white p-5 border border-[#EAE6DF] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <span className="text-xs text-[#6B7280] font-medium uppercase tracking-wider block mb-1">Active Deliveries</span>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-bold tracking-tight">{deliveries.filter(d => d.status !== 'DELIVERED' && d.status !== 'CANCELLED').length}</span>
              <span className="text-xs text-indigo-600 font-medium bg-indigo-50 px-1.5 py-0.5 rounded">In Transit</span>
            </div>
          </div>

          {/* System Health Status Panel */}
          <div className="col-span-1 md:col-span-2 bg-white p-5 border border-[#EAE6DF] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] flex flex-col justify-between">
            <span className="text-xs text-[#6B7280] font-medium uppercase tracking-wider block mb-2">System Health (Infrastructure Vitals)</span>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
              <div className="flex items-center space-x-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${isRedisUp ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                <span className="font-medium">Redis</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${isPostgresUp ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                <span className="font-medium">PostgreSQL</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${isCeleryUp ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                <span className="font-medium">Celery</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${isWsUp ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                <span className="font-medium">WebSockets</span>
              </div>

              {queueBacklog > 0 && (
                <div className="flex items-center space-x-1.5 px-2 py-0.5 bg-amber-50 text-amber-800 rounded border border-amber-200">
                  <Activity className="w-3.5 h-3.5" />
                  <span className="font-semibold">Backlog: {queueBacklog}</span>
                </div>
              )}
              {dlqCount > 0 && (
                <div className="flex items-center space-x-1.5 px-2 py-0.5 bg-rose-50 text-rose-800 rounded border border-rose-200 animate-pulse">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span className="font-semibold">DLQ: {dlqCount}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex-grow max-w-7xl mx-auto w-full px-6 py-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Left Sidebar: Controls & Settings */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Create & Dispatch Order Form */}
          <div className="p-5 bg-white border border-[#EAE6DF] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-4">
            <div className="flex items-center space-x-2 pb-2 border-b border-[#EAE6DF]">
              <Navigation className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-semibold text-[#111827]">Dispatch New Delivery</h2>
            </div>
            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-medium">
                {error}
              </div>
            )}
            {successMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-medium">
                {successMsg}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-[#6B7280] block mb-1 font-medium">Pickup Lat</label>
                <input 
                  type="number" 
                  step="0.0001" 
                  value={pickupLat} 
                  onChange={(e) => setPickupLat(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAE6DF] rounded-lg text-[#111827] focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
              <div>
                <label className="text-[#6B7280] block mb-1 font-medium">Pickup Lng</label>
                <input 
                  type="number" 
                  step="0.0001" 
                  value={pickupLng} 
                  onChange={(e) => setPickupLng(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAE6DF] rounded-lg text-[#111827] focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-[#6B7280] block mb-1 font-medium">Dropoff Lat</label>
                <input 
                  type="number" 
                  step="0.0001" 
                  value={dropoffLat} 
                  onChange={(e) => setDropoffLat(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAE6DF] rounded-lg text-[#111827] focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
              <div>
                <label className="text-[#6B7280] block mb-1 font-medium">Dropoff Lng</label>
                <input 
                  type="number" 
                  step="0.0001" 
                  value={dropoffLng} 
                  onChange={(e) => setDropoffLng(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#EAE6DF] rounded-lg text-[#111827] focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
            </div>
            <button
              onClick={handleCreateAndDispatch}
              disabled={loading}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold text-xs rounded-lg transition-all shadow-[0_1px_2px_rgba(0,0,0,0.05)] cursor-pointer"
            >
              {loading ? "Processing..." : "Create & Auto-Dispatch Order"}
            </button>
          </div>

          {/* Connection Settings */}
          <div className="p-5 bg-white border border-[#EAE6DF] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-3">
            <div className="flex items-center space-x-2 pb-2 border-b border-[#EAE6DF]">
              <Settings className="w-4 h-4 text-[#6B7280]" />
              <h2 className="text-sm font-semibold text-[#111827]">Server Credentials</h2>
            </div>
            <div>
              <label className="text-[10px] text-[#6B7280] block mb-0.5 font-medium uppercase tracking-wider">Gateway API Url</label>
              <input 
                type="text" 
                value={serverUrl} 
                onChange={(e) => setServerUrl(e.target.value)} 
                className="w-full px-2.5 py-1.5 bg-[#FAF8F5] border border-[#EAE6DF] rounded-md text-xs text-[#111827] focus:outline-none font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] text-[#6B7280] block mb-0.5 font-medium uppercase tracking-wider">X-API-Key</label>
              <input 
                type="text" 
                value={apiKey} 
                onChange={(e) => setApiKey(e.target.value)} 
                className="w-full px-2.5 py-1.5 bg-[#FAF8F5] border border-[#EAE6DF] rounded-md text-xs text-[#111827] focus:outline-none font-mono"
              />
            </div>
          </div>

          {/* Operational Log Box */}
          <div className="p-5 bg-white border border-[#EAE6DF] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] flex flex-col h-[280px]">
            <div className="flex items-center space-x-2 pb-2 border-b border-[#EAE6DF] mb-3">
              <Radio className="w-4 h-4 text-indigo-600 animate-pulse" />
              <h2 className="text-sm font-semibold text-[#111827]">Live Operation Logs</h2>
            </div>
            <div className="flex-grow overflow-y-auto bg-[#FAF8F5] border border-[#EAE6DF] rounded-lg p-3 font-mono text-[10px] space-y-1.5 text-[#4B5563]">
              {logs.length === 0 ? (
                <div className="text-[#9CA3AF] text-center py-12">Listening to websocket event streams...</div>
              ) : (
                logs.map((log, index) => (
                  <div key={index} className="border-l-2 border-indigo-200 pl-2 leading-relaxed">
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Map & Table Grid */}
        <div className="lg:col-span-3 flex flex-col space-y-6">
          
          {/* Map Container */}
          <div className="h-[450px] relative rounded-xl overflow-hidden border border-[#EAE6DF] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <MapContainer center={[12.9716, 77.5946]} zoom={13} className="w-full h-full">
              {/* Light Map Tiles to match Cream aesthetic */}
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              />
              
              {/* Selected Route Polyline Overlay */}
              {selectedDelivery && (
                <>
                  <Marker position={[selectedDelivery.pickup_lat, selectedDelivery.pickup_lng]} icon={shopIcon}>
                    <Popup>
                      <div className="p-1 font-sans">
                        <span className="font-bold text-xs block text-indigo-600">Pickup Location</span>
                        <span className="text-[10px] text-gray-500">Order #{selectedDelivery.id}</span>
                      </div>
                    </Popup>
                  </Marker>
                  
                  <Marker position={[selectedDelivery.dropoff_lat, selectedDelivery.dropoff_lng]} icon={dropoffIcon}>
                    <Popup>
                      <div className="p-1 font-sans">
                        <span className="font-bold text-xs block text-rose-600">Dropoff Destination</span>
                        <span className="text-[10px] text-gray-500">Order #{selectedDelivery.id}</span>
                      </div>
                    </Popup>
                  </Marker>

                  {/* Draw Geometry Path if we have it */}
                  {routeGeometry && (
                    <Polyline 
                      positions={routeGeometry} 
                      color="#4f46e5" 
                      weight={4}
                      opacity={0.8}
                      dashArray="5, 10"
                    />
                  )}

                  {/* If no route geometry yet, draw a simple connecting line */}
                  {!routeGeometry && (
                    <Polyline 
                      positions={[
                        [selectedDelivery.pickup_lat, selectedDelivery.pickup_lng],
                        [selectedDelivery.dropoff_lat, selectedDelivery.dropoff_lng]
                      ]} 
                      color="#a855f7" 
                      weight={3}
                      opacity={0.6}
                    />
                  )}
                </>
              )}

              {/* Render all active driver positions */}
              {driverList.map((driver) => (
                <Marker key={driver.id} position={[driver.lat, driver.lng]} icon={driverIcon}>
                  <Popup>
                    <div className="p-1 font-sans text-xs">
                      <span className="font-bold block text-emerald-600">{driver.name}</span>
                      <span className="text-[10px] block text-gray-500">Last Ping: {driver.lastPing}</span>
                      {driver.deliveryId && (
                        <span className="mt-1 block px-1.5 py-0.5 bg-indigo-50 border border-indigo-150 rounded text-indigo-700 font-semibold text-[9px]">
                          Carrying Order #{driver.deliveryId}
                        </span>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ))}

              {selectedDelivery && (
                <MapController selectedDelivery={selectedDelivery} driverLoc={selectedDriver} />
              )}
            </MapContainer>
          </div>

          {/* Recent Deliveries & Details List */}
          <div className="p-5 bg-white border border-[#EAE6DF] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <div className="flex justify-between items-center pb-3 border-b border-[#EAE6DF] mb-4">
              <h2 className="text-sm font-semibold text-[#111827]">Recent Deliveries Pipeline</h2>
              {selectedDeliveryId && (
                <button 
                  onClick={() => setSelectedDeliveryId(null)}
                  className="text-xs text-[#6B7280] hover:text-[#111827] font-medium border border-[#EAE6DF] px-2.5 py-1 rounded-md bg-[#FAF8F5]"
                >
                  Clear Map Selection
                </button>
              )}
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#EAE6DF] text-[#6B7280] font-semibold">
                    <th className="py-2.5 px-3">Order ID</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Driver Assigned</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAE6DF]">
                  {deliveries.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-[#9CA3AF]">
                        No deliveries registered in database. Use the dispatch form to create one.
                      </td>
                    </tr>
                  ) : (
                    deliveries.map((order) => {
                      const isSelected = order.id === selectedDeliveryId;
                      return (
                        <tr key={order.id} className={`hover:bg-[#FAF8F5] transition-colors ${isSelected ? 'bg-indigo-50/40 hover:bg-indigo-50/50' : ''}`}>
                          <td className="py-3 px-3 font-semibold text-[#111827]">#{order.id}</td>
                          <td className="py-3 px-3">
                            <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                              order.status === 'DELIVERED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                              order.status === 'DRIVER_PENDING' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                              order.status === 'ASSIGNED' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' :
                              order.status === 'IN_TRANSIT' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                              order.status === 'CANCELLED' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                              'bg-gray-100 text-gray-700 border border-gray-200'
                            }`}>
                              {order.status}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-[#4B5563] font-medium">
                            {order.driver_id ? `Courier #${order.driver_id}` : 'Pending Assignment'}
                          </td>
                          <td className="py-3 px-3 text-right space-x-3">
                            <button
                              onClick={() => setSelectedDeliveryId(order.id)}
                              className="text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                            >
                              Show on Map
                            </button>
                            <Link
                              to={`/track/${order.id}`}
                              className="text-[#6B7280] hover:text-[#111827] font-semibold"
                            >
                              Customer Link →
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Fleet;
