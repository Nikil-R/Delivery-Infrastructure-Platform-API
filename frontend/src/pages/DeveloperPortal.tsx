import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Code, Key, BookOpen, Activity, Terminal, Copy, Check } from 'lucide-react';

const DeveloperPortal: React.FC = () => {
  const [serverUrl, setServerUrl] = useState(() => localStorage.getItem('dep_server_url') || 'http://localhost:8000');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('dep_api_key') || 'test_api_key_123');

  const [usageData, setUsageData] = useState<any>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const fetchUsage = async () => {
    try {
      const res = await fetch(`${serverUrl}/analytics/tenant`, {
        headers: { 'X-API-Key': apiKey }
      });
      if (res.ok) {
        const data = await res.json();
        setUsageData(data);
      }
    } catch (err) {}
  };

  useEffect(() => {
    fetchUsage();
    const interval = setInterval(fetchUsage, 6000);
    return () => clearInterval(interval);
  }, [serverUrl, apiKey]);

  // Save configs
  useEffect(() => {
    localStorage.setItem('dep_server_url', serverUrl);
    localStorage.setItem('dep_api_key', apiKey);
  }, [serverUrl, apiKey]);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const curlExample = `curl -X POST "${serverUrl}/deliveries" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${apiKey}" \\
  -d '{
    "pickup_lat": 12.9716,
    "pickup_lng": 77.5946,
    "dropoff_lat": 12.9816,
    "dropoff_lng": 77.6046
  }'`;

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
              <Code className="w-5 h-5 text-indigo-600" />
              <span className="font-semibold text-base">Developer Portal & API Docs</span>
            </div>
          </div>
        </div>
      </header>

      {/* Content Layout */}
      <div className="flex-grow max-w-7xl mx-auto w-full px-6 py-8 grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Left Config Panel */}
        <div className="lg:col-span-1 space-y-6">
          <div className="p-5 bg-white border border-[#EAE6DF] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-4">
            <div className="flex items-center space-x-2 pb-2 border-b border-[#EAE6DF]">
              <Key className="w-4 h-4 text-indigo-600" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">API Settings</h2>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-[#6B7280] block mb-1 font-medium uppercase tracking-wider">Gateway Endpoint</label>
                <input 
                  type="text" 
                  value={serverUrl} 
                  onChange={(e) => setServerUrl(e.target.value)} 
                  className="w-full px-2.5 py-1.5 bg-[#FAF8F5] border border-[#EAE6DF] rounded-md text-xs text-[#111827] focus:outline-none font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] text-[#6B7280] block mb-1 font-medium uppercase tracking-wider">X-API-Key</label>
                <input 
                  type="text" 
                  value={apiKey} 
                  onChange={(e) => setApiKey(e.target.value)} 
                  className="w-full px-2.5 py-1.5 bg-[#FAF8F5] border border-[#EAE6DF] rounded-md text-xs text-[#111827] focus:outline-none font-mono"
                />
              </div>
            </div>
          </div>

          {/* Usage Metering stats */}
          <div className="p-5 bg-white border border-[#EAE6DF] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-4">
            <div className="flex items-center space-x-2 pb-2 border-b border-[#EAE6DF]">
              <Activity className="w-4 h-4 text-indigo-600" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">Quota Usage</h2>
            </div>

            {usageData ? (
              <div className="space-y-4 text-xs">
                <div>
                  <span className="text-[#6B7280] block font-medium">Billing Tier Plan</span>
                  <span className="font-semibold text-indigo-600 text-sm">{usageData.plan_name}</span>
                </div>
                <div>
                  <span className="text-[#6B7280] block font-medium">Rate Limit Capacity</span>
                  <span className="font-mono text-[#111827]">{usageData.rate_limit_per_minute} req/min</span>
                </div>
                <div>
                  <span className="text-[#6B7280] block font-medium">Monthly API Requests</span>
                  <div className="flex justify-between font-bold text-[#111827] mt-0.5">
                    <span>{usageData.monthly_usage}</span>
                    <span className="text-[#6B7280]">/ {usageData.monthly_quota}</span>
                  </div>
                </div>
                <div className="w-full bg-[#FAF8F5] rounded-full h-2 border border-[#EAE6DF] overflow-hidden">
                  <div 
                    className="h-full bg-indigo-600 rounded-full transition-all"
                    style={{ width: `${Math.min(100, (usageData.monthly_usage / usageData.monthly_quota) * 100)}%` }}
                  ></div>
                </div>
                <div>
                  <span className="text-[#6B7280] block font-medium">Quota Remaining</span>
                  <span className="font-semibold text-emerald-600">
                    {Math.max(0, usageData.monthly_quota - usageData.monthly_usage)} requests
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <span className="text-[#9CA3AF] italic">Enter a valid tenant X-API-Key to view live billing usage statistics.</span>
                <div className="pt-2 border-t border-[#EAE6DF] space-y-2">
                  <div className="flex justify-between">
                    <span className="text-[#6B7280]">Default Quota:</span>
                    <span className="font-bold">10,000 / mo</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#6B7280]">Rate Limit:</span>
                    <span className="font-bold">60 req/min</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Section: Quick Start & Docs References */}
        <div className="lg:col-span-3 space-y-6">
          
          {/* Quick Start Card */}
          <div className="p-5 bg-white border border-[#EAE6DF] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Terminal className="w-4 h-4 text-indigo-600" />
                <h2 className="text-sm font-semibold text-[#111827]">Quick Start (Curl Example)</h2>
              </div>
              <button 
                onClick={() => handleCopy(curlExample, 'curl')}
                className="p-1 hover:bg-[#FAF8F5] rounded border border-[#EAE6DF] text-[#6B7280] hover:text-[#111827] flex items-center space-x-1.5 transition-all text-xs cursor-pointer"
              >
                {copiedText === 'curl' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedText === 'curl' ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
            
            <p className="text-xs text-[#6B7280] leading-relaxed">
              Use this command to create and auto-dispatch a delivery instantly from any terminal. It sends the request to the API Gateway load balancer, which resolves the tenant credentials and initializes driver assignment.
            </p>
            
            <pre className="bg-[#FAF8F5] border border-[#EAE6DF] rounded-lg p-3.5 font-mono text-[10px] text-[#4B5563] overflow-x-auto leading-relaxed whitespace-pre">
              {curlExample}
            </pre>
          </div>

          {/* Reference Docs List */}
          <div className="p-5 bg-white border border-[#EAE6DF] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-5">
            <div className="flex items-center space-x-2 pb-2 border-b border-[#EAE6DF]">
              <BookOpen className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-semibold text-[#111827]">Endpoint API Specifications</h2>
            </div>

            {/* Spec 1: Create Delivery */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold px-2 py-0.5 rounded text-[10px]">POST</span>
                  <span className="font-mono text-xs font-semibold text-[#111827]">/deliveries</span>
                </div>
                <span className="text-[10px] text-[#6B7280] font-medium">Create New Dispatch Order</span>
              </div>
              <p className="text-xs text-[#6B7280]">
                Initializes a delivery item by providing pickup and dropoff geolocation decimal degree coordinates.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-[9px] text-[#6B7280] font-bold uppercase tracking-wider block">JSON Request Body</span>
                  <pre className="bg-[#FAF8F5] border border-[#EAE6DF] rounded-lg p-2.5 font-mono text-[9px] text-[#4B5563]">
{`{
  "pickup_lat": 12.9716,
  "pickup_lng": 77.5946,
  "dropoff_lat": 12.9816,
  "dropoff_lng": 77.6046
}`}
                  </pre>
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] text-[#6B7280] font-bold uppercase tracking-wider block">JSON Response Payload</span>
                  <pre className="bg-[#FAF8F5] border border-[#EAE6DF] rounded-lg p-2.5 font-mono text-[9px] text-[#4B5563]">
{`{
  "id": 102,
  "status": "CREATED",
  "pickup_lat": 12.9716,
  "pickup_lng": 77.5946,
  "driver_id": null
}`}
                  </pre>
                </div>
              </div>
            </div>

            {/* Spec 2: Track Delivery */}
            <div className="space-y-2 pt-4 border-t border-[#EAE6DF]">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="bg-indigo-50 border border-indigo-200 text-indigo-750 font-bold px-2 py-0.5 rounded text-[10px]">GET</span>
                  <span className="font-mono text-xs font-semibold text-[#111827]">/deliveries/{"{id}"}</span>
                </div>
                <span className="text-[10px] text-[#6B7280] font-medium">Retrieve Order Status</span>
              </div>
              <p className="text-xs text-[#6B7280]">
                Fetches active variables and assignment conditions for a single specific order entry.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-[9px] text-[#6B7280] font-bold uppercase tracking-wider block">Path Variables</span>
                  <pre className="bg-[#FAF8F5] border border-[#EAE6DF] rounded-lg p-2.5 font-mono text-[9px] text-[#4B5563] h-[74px] flex items-center pl-4">
{`delivery_id: integer (ID of the order)`}
                  </pre>
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] text-[#6B7280] font-bold uppercase tracking-wider block">JSON Response Payload</span>
                  <pre className="bg-[#FAF8F5] border border-[#EAE6DF] rounded-lg p-2.5 font-mono text-[9px] text-[#4B5563]">
{`{
  "id": 102,
  "status": "IN_TRANSIT",
  "driver_id": 8,
  "dropoff_lat": 12.9816,
  "dropoff_lng": 77.6046
}`}
                  </pre>
                </div>
              </div>
            </div>

            {/* Spec 3: Assign Driver */}
            <div className="space-y-2 pt-4 border-t border-[#EAE6DF]">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold px-2 py-0.5 rounded text-[10px]">POST</span>
                  <span className="font-mono text-xs font-semibold text-[#111827]">/deliveries/assign-driver</span>
                </div>
                <span className="text-[10px] text-[#6B7280] font-medium">Trigger Auto-Assignment</span>
              </div>
              <p className="text-xs text-[#6B7280]">
                Fires the matching state engine, locating the closest online available driver inside Redis using a geo radius lookup.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-[9px] text-[#6B7280] font-bold uppercase tracking-wider block">JSON Request Body</span>
                  <pre className="bg-[#FAF8F5] border border-[#EAE6DF] rounded-lg p-2.5 font-mono text-[9px] text-[#4B5563]">
{`{
  "order_id": 102
}`}
                  </pre>
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] text-[#6B7280] font-bold uppercase tracking-wider block">JSON Response Payload</span>
                  <pre className="bg-[#FAF8F5] border border-[#EAE6DF] rounded-lg p-2.5 font-mono text-[9px] text-[#4B5563]">
{`{
  "id": 102,
  "status": "DRIVER_PENDING",
  "driver_id": 8,
  "pickup_lat": 12.9716
}`}
                  </pre>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};

export default DeveloperPortal;
