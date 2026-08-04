import { useSearchParams } from "react-router-dom";
import { useTenant } from "@/config/tenant";

const WelcomePreview = () => {
  const { tenant } = useTenant();
  const [searchParams] = useSearchParams();
  const firstName = searchParams.get("name") || "Guest";

  return (
    <div className="min-h-screen flex items-center justify-center overflow-hidden" style={{ backgroundColor: '#fff5e4' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@300;400;500&display=swap');
        
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        
        @keyframes pulse {
          0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
          40% { transform: scale(1.2); opacity: 1; }
        }
        
        .welcome-container {
          animation: fadeIn 0.8s ease-out;
        }
        
        .loading-dot {
          animation: pulse 1.4s infinite ease-in-out;
        }
        
        .loading-dot:nth-child(1) { animation-delay: -0.32s; }
        .loading-dot:nth-child(2) { animation-delay: -0.16s; }
      `}</style>
      
      <div className="welcome-container text-center">
        <img 
          src="/venue-welcome-logo.png" 
          alt={tenant.venue_name} 
          className="w-[210px] mx-auto mb-12"
          style={{ filter: 'drop-shadow(0 10px 30px rgba(31, 76, 37, 0.15))' }}
        />
        
        <h1 
          className="text-[96px] mb-2 uppercase tracking-wide"
          style={{ 
            fontFamily: 'Anton, sans-serif', 
            color: '#1f4c25',
            fontWeight: 400,
            letterSpacing: '2px'
          }}
        >
          Hi {firstName}!
        </h1>
        
        <h2 
          className="text-[56px] mb-16 uppercase"
          style={{ 
            fontFamily: 'Anton, sans-serif', 
            color: '#ec622d',
            fontWeight: 400,
            letterSpacing: '1px'
          }}
        >
          Welcome to {tenant.venue_name}
        </h2>
        
        <p 
          className="text-[28px] mb-3"
          style={{ 
            fontFamily: 'Inter, sans-serif', 
            color: '#1f4c25',
            opacity: 0.85,
            fontWeight: 400
          }}
        >
          Your session is starting.
        </p>
        
        <p 
          className="text-[28px]"
          style={{ 
            fontFamily: 'Inter, sans-serif', 
            color: '#1f4c25',
            opacity: 0.85,
            fontWeight: 400
          }}
        >
          This window will close when you're ready to tee off!
        </p>

        {/* Etiquette Section */}
        <div 
          className="mt-12 mx-auto text-left px-10 py-8 rounded-2xl"
          style={{ 
            backgroundColor: 'rgba(31, 76, 37, 0.08)',
            border: '2px solid rgba(31, 76, 37, 0.15)',
            maxWidth: '720px'
          }}
        >
          <h3 
            className="text-[36px] mb-5 uppercase text-center"
            style={{ 
              fontFamily: 'Anton, sans-serif', 
              color: '#1f4c25',
              fontWeight: 400,
              letterSpacing: '2px'
            }}
          >
            {tenant.venue_name} Etiquette
          </h3>
          <ol className="space-y-3" style={{ fontFamily: 'Inter, sans-serif', color: '#1f4c25' }}>
            {[
              "Use a different ball after every shot, this prevents a ball cracking on you!",
              "If you keep skying your drives, tee it down lower",
              "Keep the bay tidy for the next golfer",
              "Indoor Swing Syndrome is real (Google it!)"
            ].map((rule, i) => (
              <li key={i} className="flex gap-3 items-start text-[22px]" style={{ opacity: 0.85 }}>
                <span 
                  className="flex-shrink-0 w-[32px] h-[32px] rounded-full flex items-center justify-center text-[16px] font-semibold mt-[2px]"
                  style={{ backgroundColor: '#ec622d', color: '#fff' }}
                >
                  {i + 1}
                </span>
                <span>{rule}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-10 flex gap-4 justify-center">
          <span 
            className="loading-dot w-[18px] h-[18px] rounded-full"
            style={{ backgroundColor: '#ec622d' }}
          />
          <span 
            className="loading-dot w-[18px] h-[18px] rounded-full"
            style={{ backgroundColor: '#ec622d' }}
          />
          <span 
            className="loading-dot w-[18px] h-[18px] rounded-full"
            style={{ backgroundColor: '#ec622d' }}
          />
        </div>
      </div>
    </div>
  );
};

export default WelcomePreview;
