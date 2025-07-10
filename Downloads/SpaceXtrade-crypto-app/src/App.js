import React, { useState, useEffect, createContext, useContext, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut 
} from 'firebase/auth';
import { 
    getFirestore, 
    doc, 
    setDoc, 
    getDoc,
    updateDoc,
    collection,
    addDoc,
    query,
    onSnapshot,
    serverTimestamp,
    getDocs
} from 'firebase/firestore';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

// --- Firebase Configuration ---
const firebaseConfig = {
apiKey: "AIzaSyAvYmLTcwuuk9PYc891qcxww9b8OMYIsdc",
  authDomain: "spacextrade-crypto-app.firebaseapp.com",
  projectId: "spacextrade-crypto-app",
  storageBucket: "spacextrade-crypto-app.firebasestorage.app",
  messagingSenderId: "357090959109",
  appId: "1:357090959109:web:c3b927f3ad4eaddeb9616c",
  measurementId: "G-5GE2MCJ52B"
};

// --- !!! YOUR WALLET ADDRESSES !!! ---
const yourWalletAddresses = {
    BTC: "bc1qtu0lw37nvakj5l88ph9zep27yspnedu8h9cax2",
    ETH: "YOUR_ETHEREUM_WALLET_ADDRESS_HERE",
    USDT: "YOUR_USDT_WALLET_ADDRESS_HERE_(ERC20_OR_TRC20)",
    SOL: "YOUR_SOLANA_WALLET_ADDRESS_HERE",
    XRP: "YOUR_XRP_WALLET_ADDRESS_HERE_AND_DESTINATION_TAG",
};

// --- !!! CRITICAL FIREBASE SETUP REQUIRED !!! ---
// To prevent "Missing or insufficient permissions" errors, you MUST update your Firestore Security Rules.
//
// STEP 1: Go to your Firebase project -> Build -> Firestore Database -> Rules tab.
// STEP 2: Replace all existing text with the rules below.
//
//    rules_version = '2';
//    service cloud.firestore {
//      match /databases/{database}/documents {
//        match /users/{userId}/{document=**} {
//          allow read, write: if request.auth.uid == userId || 
//                              (exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
//                               get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true);
//        }
//        match /chats/{chatId}/{document=**} {
//          allow read, write: if (request.auth.uid != null && chatId == "user_" + request.auth.uid) ||
//                              (exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
//                               get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true);
//        }
//        match /giftCardRedemptions/{redemptionId} {
//            allow create: if request.auth != null;
//            allow read: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true;
//        }
//      }
//    }
//
// STEP 3: Click "Publish".

// --- Initialize Firebase ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Contexts for State Management ---
const AuthContext = createContext();
const DataContext = createContext();

// --- Main App Component ---
export default function App() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                const userDocRef = doc(db, 'users', currentUser.uid);
                const userDocSnap = await getDoc(userDocRef);
                setIsAdmin(userDocSnap.exists() && userDocSnap.data().isAdmin);
            } else {
                setIsAdmin(false);
            }
            setUser(currentUser);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const authContextValue = {
        user,
        loading,
        isAdmin,
        login: (email, password) => signInWithEmailAndPassword(auth, email, password),
        signup: (email, password) => createUserWithEmailAndPassword(auth, email, password),
        logout: async () => {
            await signOut(auth);
            setIsAdmin(false);
        },
    };

    if (loading) return <LoadingScreen />;

    return (
        <AuthContext.Provider value={authContextValue}>
            <div className="bg-gray-900 text-gray-100 min-h-screen font-sans">
                {!user ? <AuthPage /> : isAdmin ? <AdminApp /> : <UserApp />}
            </div>
        </AuthContext.Provider>
    );
}

// --- User-Facing App ---
function UserApp() {
    const [page, setPage] = useState('dashboard');
    const { user } = useContext(AuthContext);
    const [userData, setUserData] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [marketData, setMarketData] = useState([]);
    const [marketDataError, setMarketDataError] = useState(null);

    // --- Fetch User Data ---
    useEffect(() => {
        if (!user) return;
        const userDocRef = doc(db, 'users', user.uid);
        const unsubUser = onSnapshot(userDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setUserData(docSnap.data());
            } else {
                const initialData = { balances: { USD: 10000 }, email: user.email, isAdmin: false };
                setDoc(userDocRef, initialData);
                setUserData(initialData);
            }
        }, (error) => {
            console.error("User data listener error:", error);
        });

        const transColRef = collection(db, `users/${user.uid}/transactions`);
        const q = query(transColRef);
        const unsubTrans = onSnapshot(q, (snapshot) => {
            const userTransactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            userTransactions.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
            setTransactions(userTransactions);
        }, (error) => {
            console.error("Transactions listener error:", error);
        });

        return () => { unsubUser(); unsubTrans(); };
    }, [user]);

    // --- Fetch Market Data ---
    const fetchMarketData = async () => {
        setMarketDataError(null);
        try {
            const topCoins = ['bitcoin', 'ethereum', 'tether', 'binancecoin', 'solana', 'ripple', 'dogecoin', 'cardano', 'avalanche-2', 'shiba-inu', 'polkadot', 'chainlink', 'tron', 'bitcoin-cash', 'litecoin', 'near', 'uniswap'];
            const ids = topCoins.join(',');
            const marketResponse = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=100&page=1&sparkline=true&price_change_percentage=24h`);
            if (!marketResponse.ok) throw new Error('Failed to fetch market data');
            const marketJson = await marketResponse.json();

            setMarketData(marketJson.map(coin => ({
                id: coin.id,
                symbol: coin.symbol.toUpperCase(),
                name: coin.name,
                image: coin.image,
                price_usd: coin.current_price,
                change: coin.price_change_percentage_24h,
                sparkline: coin.sparkline_in_7d.price,
            })));
        } catch (error) {
            console.error("Could not fetch market data:", error);
            setMarketDataError("Could not load market data. Please check your connection.");
        }
    };

    useEffect(() => {
        fetchMarketData();
        const interval = setInterval(fetchMarketData, 60000);
        return () => clearInterval(interval);
    }, []);

    const dataContextValue = { userData, transactions, marketData, marketDataError, fetchMarketData, refreshData: () => {} };

    return (
        <DataContext.Provider value={dataContextValue}>
            <div className="p-4 sm:p-6 lg:p-8">
                {page === 'dashboard' ? (
                    <DashboardPage setPage={setPage} />
                ) : (
                    <div className="max-w-4xl mx-auto">
                        <button onClick={() => setPage('dashboard')} className="mb-6 text-green-400 hover:underline flex items-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                            Back to Dashboard
                        </button>
                        <PageContent currentPage={page} setPage={setPage} />
                    </div>
                )}
            </div>
        </DataContext.Provider>
    );
}

// --- Admin App ---
function AdminApp() {
    return <div className="p-8 text-center text-2xl">Admin Panel</div>;
}

// --- AUTH & SHARED ---
const Logo = () => (
    <div className="flex items-center space-x-2">
        <svg className="w-10 h-10 text-green-400" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 7l10 5 10-5-10-5z" fill="currentColor" opacity="0.6"/>
            <path d="M2 17l10 5 10-5" fill="currentColor" opacity="0.6"/>
            <path d="M2 12l10 5 10-5" fill="currentColor"/>
        </svg>
        <span className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-teal-500">SpaceXtrade</span>
    </div>
);


function AuthPage() {
    const [isLogin, setIsLogin] = useState(true);
    const { login, signup } = useContext(AuthContext);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            if (isLogin) {
                await login(email, password);
            } else {
                const userCredential = await signup(email, password);
                await setDoc(doc(db, "users", userCredential.user.uid), {
                    email: userCredential.user.email,
                    balances: { USD: 10000 },
                    isAdmin: false
                });
            }
        } catch (err) {
            setError(err.message.replace('Firebase: ', ''));
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800 p-4">
            <div className="w-full max-w-md bg-gray-800/50 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-gray-700">
                <div className="text-center mb-8">
                    <Logo />
                    <p className="text-gray-400 mt-2">Your Gateway to Digital Assets</p>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label className="block text-gray-400 mb-2" htmlFor="email">Email</label>
                        <input type="email" id="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-green-400 transition-all" required />
                    </div>
                    <div className="mb-6">
                        <label className="block text-gray-400 mb-2" htmlFor="password">Password</label>
                        <input type="password" id="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-green-400 transition-all" required />
                    </div>
                    {error && <p className="text-red-500 text-sm mb-4 text-center">{error}</p>}
                    <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-green-500 to-teal-600 hover:from-green-600 hover:to-teal-700 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 disabled:opacity-50 shadow-lg">
                        {loading ? 'Processing...' : (isLogin ? 'Login' : 'Sign Up')}
                    </button>
                </form>
                <p className="text-center text-gray-400 mt-6">
                    {isLogin ? "Don't have an account?" : "Already have an account?"}
                    <button onClick={() => setIsLogin(!isLogin)} className="text-green-400 hover:text-green-300 font-semibold ml-2">
                        {isLogin ? 'Sign Up' : 'Login'}
                    </button>
                </p>
            </div>
        </div>
    );
}

function LoadingScreen() {
    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-900">
            <div className="text-center">
                <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-green-400"></div>
                <p className="mt-4 text-lg text-gray-300">Loading Financial Hub...</p>
            </div>
        </div>
    );
}

// --- USER APP COMPONENTS ---
function PageContent({ currentPage, setPage }) {
    switch (currentPage) {
        case 'crypto': return <CryptoPage />;
        case 'giftcards': return <GiftCardPage />;
        case 'wallet': return <WalletPage />;
        case 'chat': return <ChatPage />;
        default: return <DashboardPage setPage={setPage} />;
    }
}

function DashboardPage({ setPage }) {
    const { userData, marketData, marketDataError, fetchMarketData } = useContext(DataContext);
    const { user, logout } = useContext(AuthContext);
    
    const portfolioValueUSD = useMemo(() => {
        if (!userData || !marketData.length) return 10000;
        const { balances } = userData;
        let totalValue = balances.USD || 0;
        
        Object.keys(balances).forEach(symbol => {
            if(symbol !== 'USD') {
                const coin = marketData.find(c => c.symbol === symbol);
                if(coin) {
                    totalValue += (balances[symbol] || 0) * coin.price_usd;
                }
            }
        });
        return totalValue > 0 ? totalValue : 10000;
    }, [userData, marketData]);

    if (!userData) return <LoadingScreen />;

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
                <Logo />
                <button onClick={logout} className="bg-red-500/20 text-red-300 px-4 py-2 rounded-lg hover:bg-red-500/40 transition-all">Logout</button>
            </div>
            
            <div className="p-6 bg-gradient-to-br from-green-500/20 to-teal-500/20 rounded-2xl shadow-lg border border-gray-700">
                <div className="flex justify-between items-start">
                    <div>
                        <h3 className="text-gray-400 text-sm">Total Portfolio Value</h3>
                        <p className="text-4xl font-bold text-white mt-2">${portfolioValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <button onClick={() => setPage('wallet')} className="bg-white/10 text-white px-4 py-2 rounded-lg hover:bg-white/20 transition-all">View Wallet</button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <button onClick={() => setPage('crypto')} className="flex flex-col items-center justify-center p-4 bg-gray-800/50 rounded-2xl border border-gray-700 hover:bg-gray-700/50 transition-all">
                    <div className="p-3 bg-green-500/20 rounded-full mb-2"><svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg></div>
                    <span className="font-semibold">Trade</span>
                </button>
                 <button onClick={() => setPage('giftcards')} className="flex flex-col items-center justify-center p-4 bg-gray-800/50 rounded-2xl border border-gray-700 hover:bg-gray-700/50 transition-all">
                    <div className="p-3 bg-blue-500/20 rounded-full mb-2"><svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4H5z" /></svg></div>
                    <span className="font-semibold">Redeem</span>
                </button>
                <button onClick={() => setPage('wallet')} className="flex flex-col items-center justify-center p-4 bg-gray-800/50 rounded-2xl border border-gray-700 hover:bg-gray-700/50 transition-all">
                    <div className="p-3 bg-purple-500/20 rounded-full mb-2"><svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-purple-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg></div>
                    <span className="font-semibold">Wallet</span>
                </button>
                <button onClick={() => setPage('chat')} className="flex flex-col items-center justify-center p-4 bg-gray-800/50 rounded-2xl border border-gray-700 hover:bg-gray-700/50 transition-all">
                    <div className="p-3 bg-yellow-500/20 rounded-full mb-2"><svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-yellow-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg></div>
                    <span className="font-semibold">Support</span>
                </button>
            </div>
            
            {marketDataError ? (
                 <div className="text-center text-red-400 flex flex-col items-center justify-center h-full bg-gray-800/50 p-6 rounded-2xl border border-gray-700">
                    <p>{marketDataError}</p>
                    <button onClick={fetchMarketData} className="mt-2 bg-red-500/50 text-white px-3 py-1 rounded-lg">Retry</button>
                </div>
            ) : (
                <>
                    <CryptoMarquee />
                    <GiftCardMarquee />
                </>
            )}

        </div>
    );
}

function BonusModal({ onTrade, onClose }) {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-2xl p-8 w-full max-w-md border border-gray-700 text-center">
                <h3 className="text-2xl font-bold mb-4 text-yellow-400">Bonus Withdrawal</h3>
                <p className="text-gray-300 mb-6">Trade $5,000 in BTC to unlock your bonus for withdrawal.</p>
                <div className="flex gap-4">
                    <button onClick={onClose} className="w-full bg-gray-600/50 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-all">Cancel</button>
                    <button onClick={onTrade} className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg transition-all">Trade Now</button>
                </div>
            </div>
        </div>
    );
}

function TradeForBonusModal({ onClose }) {
    const walletAddress = yourWalletAddresses['BTC'] || "No BTC address configured.";
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        const textArea = document.createElement("textarea");
        textArea.value = walletAddress;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
        document.body.removeChild(textArea);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-2xl p-8 w-full max-w-md border border-gray-700 text-center">
                <h3 className="text-2xl font-bold mb-4">Trade BTC</h3>
                <p className="text-gray-400 mb-4">Send at least $5,000 worth of BTC to the address below to unlock your bonus.</p>
                
                <div className="bg-gray-900 p-4 rounded-lg border border-gray-600 mb-4">
                    <p className="text-green-400 font-mono break-words">{walletAddress}</p>
                </div>

                <button onClick={handleCopy} className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg mb-4 transition-all">
                    {copied ? 'Address Copied!' : 'Copy Address'}
                </button>

                <div className="bg-red-900/50 text-red-300 p-3 rounded-lg text-sm">
                    <p><strong>IMPORTANT:</strong> Only send BTC to this address. Sending any other coin may result in the permanent loss of your funds.</p>
                </div>
                
                <button onClick={onClose} className="mt-6 text-gray-400 hover:text-white">Close</button>
            </div>
        </div>
    );
}


function CryptoMarquee() {
    const { marketData } = useContext(DataContext);
    if (!marketData.length) return null;

    const marqueeItems = [...marketData, ...marketData]; 

    return (
        <div className="relative w-full overflow-hidden bg-gray-800/30 py-3 rounded-xl">
            <div className="flex animate-marquee">
                {marqueeItems.map((coin, index) => (
                    <div key={`${coin.id}-${index}`} className="flex items-center mx-4 flex-shrink-0">
                        <img src={coin.image} alt={coin.symbol} className="w-6 h-6 mr-2" />
                        <span className="text-gray-300">{coin.symbol}</span>
                        <span className="text-white ml-2">${coin.price_usd.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                ))}
            </div>
            <style>{`
                @keyframes marquee {
                    0% { transform: translateX(0%); }
                    100% { transform: translateX(-50%); }
                }
                .animate-marquee {
                    animation: marquee 60s linear infinite;
                }
            `}</style>
        </div>
    );
}

function GiftCardMarquee() {
    const giftCards = [
        { name: 'Amazon', logo: <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M18.999 12.63a2.003 2.003 0 01-1.417.588h-1.58a1 1 0 010-2h1.58a2.003 2.003 0 011.417.588zM12 12.63a2.003 2.003 0 01-1.417.588H9a1 1 0 110-2h1.583a2.003 2.003 0 011.417.588zM4.999 12.63a2.003 2.003 0 01-1.417.588H2a1 1 0 110-2h1.582a2.003 2.003 0 011.417.588zM12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm-1.414 15.414a2 2 0 11-2.828-2.828l2.828 2.828z"/></svg> },
        { name: 'iTunes', logo: <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4 13.5a.5.5 0 01-.5.5H8.5a.5.5 0 01-.5-.5v-7a.5.5 0 01.5-.5h2V11a2 2 0 104 0V8.5a.5.5 0 01.5-.5H16v7z"/></svg> },
        { name: 'Google Play', logo: <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8L7 4z"/></svg> },
        { name: 'Steam', logo: <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 15a5 5 0 110-10 5 5 0 010 10zm0-2a3 3 0 100-6 3 3 0 000 6z"/></svg> },
        { name: 'Vanilla', logo: <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm-1.5 14h-2l4-8h2l-4 8z"/></svg> },
    ];
    
    const marqueeItems = [...giftCards, ...giftCards];

    return (
        <div className="relative w-full overflow-hidden bg-gray-800/30 py-3 rounded-xl">
             <div className="absolute top-0 left-0 h-full w-20 bg-gradient-to-r from-gray-900 z-10"></div>
             <div className="absolute top-0 right-0 h-full w-20 bg-gradient-to-l from-gray-900 z-10"></div>
            <div className="flex animate-marquee-reverse">
                {marqueeItems.map((card, index) => (
                    <div key={`${card.name}-${index}`} className="flex items-center mx-6 flex-shrink-0">
                        {card.logo}
                    </div>
                ))}
            </div>
            <style>{`
                @keyframes marquee-reverse {
                    0% { transform: translateX(-50%); }
                    100% { transform: translateX(0%); }
                }
                .animate-marquee-reverse {
                    animation: marquee-reverse 40s linear infinite;
                }
            `}</style>
        </div>
    );
}

function CryptoPage() {
    const { marketData, marketDataError, fetchMarketData } = useContext(DataContext);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCoin, setSelectedCoin] = useState(null);

    const filteredCoins = useMemo(() => {
        if (!marketData) return [];
        return marketData.filter(coin => 
            coin.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            coin.symbol.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [marketData, searchTerm]);

    if (marketDataError) {
        return (
            <div className="text-center p-10 bg-gray-800/50 rounded-2xl border border-gray-700">
                <h2 className="text-2xl font-bold text-red-400">Error Loading Market Data</h2>
                <p className="text-gray-400 mt-2">{marketDataError}</p>
                <button onClick={fetchMarketData} className="mt-4 bg-green-500/50 text-white px-4 py-2 rounded-lg">Retry</button>
            </div>
        );
    }
    
    if (selectedCoin) {
        return <TradeView coin={selectedCoin} onBack={() => setSelectedCoin(null)} />;
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold">Trade Assets</h2>
                <p className="text-gray-400">Buy and sell from over 50 cryptocurrencies.</p>
            </div>
            <input 
                type="text"
                placeholder="Search for a coin..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-green-400 transition-all"
            />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredCoins.map(coin => (
                    <div key={coin.id} onClick={() => setSelectedCoin(coin)} className="bg-gray-800/50 p-4 rounded-xl border border-gray-700 hover:border-green-500/50 transition-all cursor-pointer">
                        <div className="flex items-center mb-4">
                            <img src={coin.image} alt={coin.name} className="w-10 h-10 mr-3" />
                            <div>
                                <p className="font-bold">{coin.symbol}</p>
                                <p className="text-sm text-gray-400">{coin.name}</p>
                            </div>
                        </div>
                        <div className="h-16 w-full mb-4">
                             <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={coin.sparkline.map(p => ({price: p}))}>
                                    <defs>
                                        <linearGradient id={`colorTrade${coin.id}`} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={coin.change >= 0 ? "#10B981" : "#EF4444"} stopOpacity={0.4}/>
                                            <stop offset="95%" stopColor={coin.change >= 0 ? "#10B981" : "#EF4444"} stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <Area type="monotone" dataKey="price" stroke={coin.change >= 0 ? "#10B981" : "#EF4444"} fillOpacity={1} fill={`url(#colorTrade${coin.id})`} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="text-lg font-bold">${coin.price_usd.toLocaleString('en-US', {minimumFractionDigits: 2})}</div>
                        <div className={`text-sm ${coin.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>{typeof coin.change === 'number' ? coin.change.toFixed(2) : '0.00'}%</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function TradeView({ coin, onBack }) {
    const { userData } = useContext(DataContext);
    const { user } = useContext(AuthContext);
    const [action, setAction] = useState('buy');
    const [amountUSD, setAmountUSD] = useState('');
    const [amountCrypto, setAmountCrypto] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const [showWalletModal, setShowWalletModal] = useState(false);

    const priceInUsd = coin.price_usd;

    const handleUsdChange = (e) => {
        const val = e.target.value;
        setAmountUSD(val);
        if (val && !isNaN(val) && priceInUsd > 0) {
            setAmountCrypto((parseFloat(val) / priceInUsd).toFixed(8));
        } else {
            setAmountCrypto('');
        }
    };

    const handleCryptoChange = (e) => {
        const val = e.target.value;
        setAmountCrypto(val);
        if (val && !isNaN(val)) {
            setAmountUSD((parseFloat(val) * priceInUsd).toFixed(2));
        } else {
            setAmountUSD('');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (action === 'sell') {
            setShowWalletModal(true);
            return;
        }

        setError(''); setSuccess(''); setLoading(true);
        const usdValue = parseFloat(amountUSD);
        const cryptoValue = parseFloat(amountCrypto);

        if (isNaN(usdValue) || isNaN(cryptoValue) || usdValue <= 0) {
            setError("Please enter a valid amount.");
            setLoading(false); return;
        }

        const userDocRef = doc(db, 'users', user.uid);
        const currentBalances = userData.balances;
        const currentCryptoBalance = currentBalances[coin.symbol] || 0;

        try {
            if ((currentBalances.USD || 0) < usdValue) throw new Error("Insufficient USD balance.");
            await updateDoc(userDocRef, {
                [`balances.USD`]: (currentBalances.USD || 0) - usdValue,
                [`balances.${coin.symbol}`]: currentCryptoBalance + cryptoValue
            });
            await addDoc(collection(db, `users/${user.uid}/transactions`), { type: 'buy', asset: coin.symbol, amountCrypto: cryptoValue, amountUSD: usdValue, priceAtTransaction: priceInUsd, timestamp: serverTimestamp() });
            setSuccess(`Successfully bought ${cryptoValue.toFixed(8)} ${coin.symbol}!`);
            setAmountUSD(''); setAmountCrypto('');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            {showWalletModal && <SellCryptoModal coin={coin} onClose={() => setShowWalletModal(false)} />}
            <button onClick={onBack} className="mb-4 text-green-400 hover:underline flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                Back to Market
            </button>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-gray-800/50 p-6 rounded-2xl border border-gray-700">
                     <div className="flex items-center mb-6">
                        <img src={coin.image} alt={coin.name} className="w-12 h-12 mr-4" />
                        <div>
                            <h3 className="text-3xl font-bold">{coin.name} ({coin.symbol})</h3>
                            <p className="text-xl text-green-400">${priceInUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                    </div>
                    <div className="h-64 w-full mb-4">
                         <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={coin.sparkline.map(p => ({price: p}))}>
                                <defs><linearGradient id={`colorTrade${coin.id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={coin.change >= 0 ? "#10B981" : "#EF4444"} stopOpacity={0.4}/><stop offset="95%" stopColor={coin.change >= 0 ? "#10B981" : "#EF4444"} stopOpacity={0}/></linearGradient></defs>
                                <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #4B5563' }} />
                                <Area type="monotone" dataKey="price" stroke={coin.change >= 0 ? "#10B981" : "#EF4444"} fillOpacity={1} fill={`url(#colorTrade${coin.id})`} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                <div className="bg-gray-800/50 p-6 rounded-2xl border border-gray-700">
                    <div className="flex mb-4 rounded-lg bg-gray-700/50 p-1">
                        <button onClick={() => setAction('buy')} className={`w-1/2 py-2 rounded-md font-semibold transition-all ${action === 'buy' ? 'bg-green-500' : ''}`}>Buy</button>
                        <button onClick={() => setAction('sell')} className={`w-1/2 py-2 rounded-md font-semibold transition-all ${action === 'sell' ? 'bg-red-500' : ''}`}>Sell</button>
                    </div>
                    <form onSubmit={handleSubmit}>
                        <div className="mb-4"><label className="block text-gray-400 mb-2">Amount in USD</label><input type="number" step="any" value={amountUSD} onChange={handleUsdChange} placeholder="0.00" className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-4 py-3 text-white" /></div>
                        <div className="mb-6"><label className="block text-gray-400 mb-2">Amount in {coin.symbol}</label><input type="number" step="any" value={amountCrypto} onChange={handleCryptoChange} placeholder="0.00000000" className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-4 py-3 text-white" /></div>
                        {error && <p className="text-red-500 text-sm mb-4 text-center">{error}</p>}{success && <p className="text-green-500 text-sm mb-4 text-center">{success}</p>}
                        <button type="submit" disabled={loading} className={`w-full text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 disabled:opacity-50 shadow-lg ${action === 'buy' ? 'bg-gradient-to-r from-green-500 to-teal-600' : 'bg-gradient-to-r from-red-500 to-orange-600'}`}>{loading ? 'Processing...' : `${action === 'buy' ? 'Buy' : 'Sell'} ${coin.symbol}`}</button>
                        <div className="text-center mt-4 text-sm text-gray-400">
                            <p>USD Balance: ${(userData.balances.USD || 0).toFixed(2)}</p>
                            <p>{coin.symbol} Balance: {(userData.balances[coin.symbol] || 0).toFixed(8)}</p>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

function SellCryptoModal({ coin, onClose }) {
    const walletAddress = yourWalletAddresses[coin.symbol] || "No address configured for this coin.";
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        const textArea = document.createElement("textarea");
        textArea.value = walletAddress;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
        document.body.removeChild(textArea);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-2xl p-8 w-full max-w-md border border-gray-700 text-center">
                <h3 className="text-2xl font-bold mb-4">Sell {coin.name} ({coin.symbol})</h3>
                <p className="text-gray-400 mb-4">To sell your {coin.symbol}, please send the desired amount to the following wallet address:</p>
                
                <div className="bg-gray-900 p-4 rounded-lg border border-gray-600 mb-4">
                    <p className="text-green-400 font-mono break-words">{walletAddress}</p>
                </div>

                <button onClick={handleCopy} className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg mb-4 transition-all">
                    {copied ? 'Address Copied!' : 'Copy Address'}
                </button>

                <div className="bg-red-900/50 text-red-300 p-3 rounded-lg text-sm">
                    <p><strong>IMPORTANT:</strong> Only send {coin.symbol} to this address. Sending any other coin may result in the permanent loss of your funds.</p>
                </div>
                
                <button onClick={onClose} className="mt-6 text-gray-400 hover:text-white">Close</button>
            </div>
        </div>
    );
}


function GiftCardPage() {
    const { user } = useContext(AuthContext);
    const { userData } = useContext(DataContext);
    const [cardType, setCardType] = useState('Amazon');
    const [amountUSD, setAmountUSD] = useState('');
    const [cardCode, setCardCode] = useState('');
    const [cardFormat, setCardFormat] = useState('E-code');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const giftCards = ['Amazon', 'iTunes', 'Google Play', 'Steam', 'Vanilla'];
    
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(''); setSuccess(''); setLoading(true);
        const usdValue = parseFloat(amountUSD);
        if (isNaN(usdValue) || usdValue <= 0 || cardCode.trim() === '') {
            setError("Please enter a valid amount and card code.");
            setLoading(false); return;
        }
        if (!userData || typeof userData.balances === 'undefined') {
            setError("User data not loaded yet. Please try again in a moment.");
            setLoading(false); return;
        }
        try {
            const userDocRef = doc(db, 'users', user.uid);
            await updateDoc(userDocRef, { 'balances.USD': (userData.balances.USD || 0) + usdValue });
            
            await addDoc(collection(db, `users/${user.uid}/transactions`), { type: 'redeem', asset: 'Gift Card', details: `${cardType} $${usdValue}`, amountUSD: usdValue, timestamp: serverTimestamp() });
            setSuccess(`Successfully redeemed ${cardType} card for $${usdValue.toFixed(2)}!`);
            setAmountUSD(''); setCardCode('');
        } catch (err) {
            setError("Failed to redeem gift card. Please try again.");
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <h2 className="text-3xl font-bold mb-8">Redeem Gift Cards</h2>
            <div className="max-w-2xl mx-auto bg-gray-800/50 p-8 rounded-2xl border border-gray-700">
                <form onSubmit={handleSubmit}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <div><label className="block text-gray-400 mb-2">Gift Card Type</label><select value={cardType} onChange={(e) => setCardType(e.target.value)} className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-green-400">{giftCards.map(card => <option key={card} value={card}>{card}</option>)}</select></div>
                        <div><label className="block text-gray-400 mb-2">Amount (USD)</label><input type="number" value={amountUSD} onChange={(e) => setAmountUSD(e.target.value)} placeholder="e.g., 100" className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-green-400" /></div>
                    </div>
                    <div className="mb-6"><label className="block text-gray-400 mb-2">Card Format</label><div className="flex gap-4">{['E-code', 'Physical'].map(format => (<button key={format} type="button" onClick={() => setCardFormat(format)} className={`w-full py-2 rounded-md font-semibold transition-all ${cardFormat === format ? 'bg-blue-500' : 'bg-gray-700/50'}`}>{format}</button>))}</div></div>
                    <div className="mb-6"><label className="block text-gray-400 mb-2">Gift Card Code</label><input type="text" value={cardCode} onChange={(e) => setCardCode(e.target.value)} placeholder="Enter your gift card code" className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-green-400" /></div>
                    <div className="bg-gray-700/50 p-4 rounded-lg mb-6 text-center border border-gray-600">
                        <p className="text-gray-300">Your USD wallet will be credited instantly upon submission.</p>
                    </div>
                    {error && <p className="text-red-500 text-sm mb-4 text-center">{error}</p>}{success && <p className="text-green-500 text-sm mb-4 text-center">{success}</p>}
                    <button type="submit" disabled={loading || !userData} className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 disabled:opacity-50 shadow-lg">{loading ? 'Redeeming...' : 'Redeem Now'}</button>
                </form>
            </div>
        </div>
    );
}

function WalletPage() {
    const { userData, transactions, marketData } = useContext(DataContext);
    const [showBonusModal, setShowBonusModal] = useState(false);
    const [showTradeForBonusModal, setShowTradeForBonusModal] = useState(false);
    
    const portfolioValueUSD = useMemo(() => {
        if (!userData || !marketData) return 10000;
        const { balances } = userData;
        let totalValue = balances.USD || 0;
        Object.keys(balances).forEach(symbol => {
            if (symbol !== 'USD') {
                const coin = marketData.find(c => c.symbol === symbol);
                if (coin) {
                    totalValue += (balances[symbol] || 0) * coin.price_usd;
                }
            }
        });
        return totalValue > 0 ? totalValue : 10000;
    }, [userData, marketData]);

    const assets = useMemo(() => {
        if (!userData || !marketData) return [];
        return Object.keys(userData.balances).map(symbol => {
            const coin = marketData.find(c => c.symbol === symbol);
            const balance = userData.balances[symbol];
            if(symbol === 'USD') {
                return { name: 'US Dollar', symbol: 'USD', balance, value: balance, icon: '$' };
            }
            if(coin && balance > 0) {
                return { name: coin.name, symbol: coin.symbol, balance, value: balance * coin.price_usd, icon: coin.image };
            }
            return null;
        }).filter(Boolean);
    }, [userData, marketData]);

    if (!userData || !marketData) return <LoadingScreen />;

    const openTradeForBonus = () => {
        setShowBonusModal(false);
        setShowTradeForBonusModal(true);
    };

    return (
        <div className="space-y-8">
            {showBonusModal && <BonusModal onTrade={openTradeForBonus} onClose={() => setShowBonusModal(false)} />}
            {showTradeForBonusModal && <TradeForBonusModal onClose={() => setShowTradeForBonusModal(false)} />}
            <h2 className="text-3xl font-bold">My Wallet</h2>
            <div className="p-6 bg-gradient-to-br from-purple-500/20 to-indigo-500/20 rounded-2xl shadow-lg border border-gray-700">
                <div className="flex justify-between items-start">
                    <div>
                        <h3 className="text-gray-400 text-sm">Total Wallet Balance</h3>
                        <p className="text-4xl font-bold text-white mt-2">${portfolioValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <button onClick={() => setShowBonusModal(true)} className="bg-white/10 text-white px-4 py-2 rounded-lg hover:bg-white/20 transition-all">Withdraw</button>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {assets.map(asset => (
                    <div key={asset.symbol} className="bg-gray-800/50 p-6 rounded-2xl border border-gray-700">
                        <div className="flex items-center mb-2">
                            {asset.symbol === 'USD' ? 
                                <span className="text-3xl font-bold text-green-400 mr-3">{asset.icon}</span> :
                                <img src={asset.icon} alt={asset.name} className="w-10 h-10 mr-3" />
                            }
                            <h3 className="text-xl font-bold">{asset.name}</h3>
                        </div>
                        <p className="text-2xl font-semibold">{asset.symbol === 'USD' ? `$${asset.balance.toLocaleString()}` : `${asset.balance.toFixed(8)} ${asset.symbol}`}</p>
                        <p className="text-gray-400">≈ ${asset.value.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                    </div>
                ))}
            </div>
            <div className="bg-gray-800/50 p-6 rounded-2xl border border-gray-700">
                <h3 className="text-xl font-bold mb-4">Transaction History</h3>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                    {transactions.length > 0 ? transactions.map(tx => (
                        <TransactionItem key={tx.id} tx={tx} />
                    )) : (<p className="text-gray-400">No transactions yet.</p>)}
                </div>
            </div>
        </div>
    );
}

function ChatPage() { 
    const { user } = useContext(AuthContext);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState("");
    const messagesEndRef = React.useRef(null);
    const chatId = `user_${user.uid}`;

    useEffect(() => {
        const q = query(collection(db, "chats", chatId, "messages"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            msgs.sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
            setMessages(msgs);
        });
        return () => unsubscribe();
    }, [chatId]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (newMessage.trim() === "") return;
        await addDoc(collection(db, "chats", chatId, "messages"), { text: newMessage, senderId: user.uid, timestamp: serverTimestamp() });
        setNewMessage("");
    };

    return (
        <div>
            <h2 className="text-3xl font-bold mb-8">Chat with Support</h2>
            <div className="bg-gray-800/50 rounded-2xl border border-gray-700 flex flex-col h-[70vh]">
                <div className="flex-1 p-6 overflow-y-auto">
                    {messages.map(msg => (
                        <div key={msg.id} className={`flex mb-4 ${msg.senderId === user.uid ? 'justify-end' : 'justify-start'}`}>
                            <div className={`rounded-lg px-4 py-2 max-w-xs lg:max-w-md ${msg.senderId === user.uid ? 'bg-green-600' : 'bg-gray-700'}`}>
                                <p className="text-white">{msg.text}</p>
                                <p className="text-xs text-gray-400 mt-1 text-right">{msg.timestamp ? new Date(msg.timestamp.seconds * 1000).toLocaleTimeString() : 'Sending...'}</p>
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>
                <form onSubmit={handleSendMessage} className="p-4 bg-gray-700/50 rounded-b-xl border-t border-gray-700 flex items-center">
                    <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Type your message..." className="flex-1 bg-gray-600/50 border border-gray-500 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-400" />
                    <button type="submit" className="ml-4 bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300">Send</button>
                </form>
            </div>
        </div>
    );
}

function AdminDashboard() { return <div className="text-center p-10 bg-gray-800/50 rounded-2xl border border-gray-700"><h2 className="text-2xl font-bold">Admin Dashboard</h2><p className="text-gray-400 mt-2">Admin components would also be restyled for a consistent, professional look.</p></div>; }
function AdminUsers() { return <div className="text-center p-10 bg-gray-800/50 rounded-2xl border border-gray-700"><h2 className="text-2xl font-bold">Admin Users</h2></div>; }
function AdminChats() { return <div className="text-center p-10 bg-gray-800/50 rounded-2xl border border-gray-700"><h2 className="text-2xl font-bold">Admin Chats</h2></div>; }
function AdminChatWindow({ chatId, onBack }) { return <div className="text-center p-10 bg-gray-800/50 rounded-2xl border border-gray-700"><h2 className="text-2xl font-bold">Admin Chat Window</h2><button onClick={onBack}>Back</button></div>; }
function EditUserModal({ user, onClose }) { return <div className="fixed inset-0 bg-black/60 flex items-center justify-center"><div className="bg-gray-800 p-6 rounded-xl"><h2 className="text-xl">Editing {user.email}</h2><button onClick={onClose} className="mt-4 bg-red-500 p-2 rounded">Close</button></div></div>; }
function TransactionItem({ tx }) { return <div className="p-2 bg-gray-700/50 rounded-md">Transaction: {tx.type}</div>; }
function AdminSidebar({ setPage, currentPage }) { return null; }
