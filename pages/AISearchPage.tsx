import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { GoogleGenAI, Type } from "@google/genai";
import { fetchFromTMDB } from '../services/apiService';
import { Movie } from '../types';
import { useProfile } from '../contexts/ProfileContext';
import { IMAGE_BASE_URL, BACKDROP_SIZE_MEDIUM } from '../contexts/constants';
import Layout from '../components/Layout';
import { useNavigate } from 'react-router-dom';
import { VirtualKeyboard } from '../components/common';
import { motion } from 'motion/react';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  isNew?: boolean;
}

const AILogo: React.FC = () => {
    const [imgErr, setImgErr] = useState(false);

    if (imgErr) {
        return (
            <div className="w-8 h-8 flex-shrink-0 bg-red-600 rounded-full flex items-center justify-center font-bold text-lg text-white" style={{ fontFamily: "'Anton', sans-serif" }}>
                N
            </div>
        );
    }

    return (
        <img 
            src="/ai-logo.png" 
            alt="AI" 
            onError={() => setImgErr(true)}
            className="w-8 h-8 flex-shrink-0 rounded-full object-cover" 
            referrerPolicy="no-referrer"
        />
    );
};

const TypewriterText: React.FC<{ text: string; speed?: number; onComplete?: () => void }> = ({ text, speed = 15, onComplete }) => {
    const [displayedText, setDisplayedText] = useState('');
    const [isFinished, setIsFinished] = useState(false);

    useEffect(() => {
        let currentIndex = 0;
        setDisplayedText('');
        setIsFinished(false);

        const interval = setInterval(() => {
            if (currentIndex < text.length) {
                setDisplayedText(text.slice(0, currentIndex + 1));
                currentIndex++;
            } else {
                clearInterval(interval);
                setIsFinished(true);
                if (onComplete) onComplete();
            }
        }, speed);

        return () => clearInterval(interval);
    }, [text, speed, onComplete]);

    return (
        <div className="whitespace-pre-wrap leading-relaxed">
            {displayedText}
            {!isFinished && (
                <motion.span 
                    animate={{ opacity: [0, 1, 0] }}
                    transition={{ repeat: Infinity, duration: 0.8 }}
                    className="inline-block w-1.5 h-4 ml-0.5 bg-red-500 align-middle"
                />
            )}
        </div>
    );
};

const ChatMessageRow: React.FC<{
    msg: ChatMessage;
    onComplete?: () => void;
}> = ({ msg, onComplete }) => {
    const isModel = msg.role === 'model';
    
    return (
        <motion.div 
            initial={msg.isNew ? { opacity: 0, y: 15 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
            {isModel && <AILogo />}
            <div className={`max-w-md lg:max-w-xl rounded-2xl p-4 ${msg.role === 'user' ? 'bg-zinc-700 rounded-br-none' : 'bg-zinc-800 rounded-bl-none'}`}>
                {isModel && msg.isNew ? (
                    <TypewriterText 
                        text={msg.content} 
                        speed={15} 
                        onComplete={onComplete} 
                    />
                ) : (
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                )}
            </div>
        </motion.div>
    );
};

const systemInstruction = `You are a smart AI assistant for a streaming service called CineStream.
Your primary role is to interact with the user and help them find movies and TV shows, or answer their general questions.

You must respond with a JSON object in the exact format shown below. Do not include markdown wrappers, do not include backticks (like \`\`\`json), and do not write any additional text outside of the JSON block.

JSON format:
{
  "response_type": "chat" | "search",
  "chat_message": "your response/greeting/explanation in the same language as the user's prompt",
  "recommendations": [
    { "title": "Inception", "media_type": "movie" },
    { "title": "Stranger Things", "media_type": "tv" }
  ]
}

Guidelines:
1. Determine if the user's input is a general conversation, social greeting, clarification, or a question that does not require recommending specific streaming titles (e.g. "مرحبا", "كيف حالك", "من أنت", "ما اسمك", "ما هو هذا الموقع"):
   - Set "response_type" to "chat".
   - Put your friendly, conversational response in "chat_message".
   - Keep "recommendations" as an empty array [].

2. If the user is specifically looking for recommendations, specific titles, genres, categories, mood-based shows, or wants to explore (e.g. "أريد أفلام رعب", "مسلسلات غموض", "أفلام 2024", "فيلم Interstellar", "أقترح لي أفلام كوميدية"):
   - Set "response_type" to "search".
   - Write a high-quality introductory or descriptive response in "chat_message" explaining your choices in the user's language.
   - In "recommendations", provide a list of highly accurate, relevant titles.
   - Return as many relevant titles as appropriate (between 3 to 10 titles) to give a comprehensive, rich list of options. If they specified a number (e.g. "أريد 5 أفلام"), return exactly that number or slightly more. Do not limit yourself to just 1 or 2 results unless they specifically asked for exactly one.

Ensure that the "chat_message" field is always in the same language as the user's query or translated appropriately.`;


const SearchResultCard: React.FC<{ movie: Movie; index: number }> = ({ movie, index }) => {
    const { setModalItem } = useProfile();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const type = movie.media_type || (movie.title ? 'movie' : 'tv');

    const handleClick = () => {
        setModalItem(movie);
    };

    if (!movie.backdrop_path) return null;

    return (
        <div 
            onClick={handleClick} 
            className="interactive-card-container cursor-pointer group animate-fade-in-up focusable rounded-lg"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && handleClick()}
            style={{ animationDelay: `${index * 80}ms` }}
        >
            <div className="relative overflow-hidden transition-all duration-300 ease-in-out transform rounded-lg shadow-lg bg-[var(--surface)] interactive-card">
                <img 
                    src={`${IMAGE_BASE_URL}${BACKDROP_SIZE_MEDIUM}${movie.backdrop_path}`} 
                    alt={movie.title || movie.name}
                    className="w-full h-auto object-cover aspect-video"
                />
                 <div className="quick-view bg-[var(--surface)] px-3">
                   <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button onClick={(e) => { e.stopPropagation(); navigate('/player', { state: { item: movie, type } }); }} className="w-9 h-9 flex items-center justify-center text-black bg-white rounded-full text-lg btn-press"><i className="fas fa-play"></i></button>
                        <button onClick={(e) => { e.stopPropagation(); /* TODO */ }} className="w-9 h-9 flex items-center justify-center text-white border-2 border-zinc-500 rounded-full text-lg btn-press hover:border-white"><i className="fas fa-plus"></i></button>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); handleClick(); }} className="w-9 h-9 flex items-center justify-center text-white border-2 border-zinc-500 rounded-full text-lg btn-press hover:border-white"><i className="fas fa-chevron-down"></i></button>
                   </div>
                   <div className="flex items-center gap-2 text-xs mt-3">
                      <span className="font-bold text-green-500">{(movie.vote_average * 10).toFixed(0)}% {t('match')}</span>
                      <span className='px-1.5 py-0.5 border border-white/50 text-[10px] rounded'>HD</span>
                   </div>
                </div>
            </div>
        </div>
    );
};


const AISearchPage: React.FC = () => {
    const { t } = useTranslation();
    const { setModalItem, activeProfile } = useProfile();
    const [messages, setMessages] = useState<ChatMessage[]>(() => [
        { id: 'initial', role: 'model', content: t('aiGreeting'), isNew: true }
    ]);
    const [searchResults, setSearchResults] = useState<Movie[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const activeApiKey = useMemo(() => {
        return activeProfile?.geminiApiKey || process.env.API_KEY || process.env.GEMINI_API_KEY;
    }, [activeProfile]);

    const ai = useMemo(() => {
        if (!activeApiKey) return null;
        return new GoogleGenAI({ apiKey: activeApiKey });
    }, [activeApiKey]);

    const handleMessageAnimationComplete = (id: string) => {
        setMessages(prev => prev.map(msg => msg.id === id ? { ...msg, isNew: false } : msg));
    };

    useEffect(() => {
        // TV browsers are laggy with smooth scrolling. Snappy instant scrolling is standard.
        const isTV = typeof navigator !== 'undefined' && /SmartTV|Tizen|Web0S|AppleTV|AndroidTV|TV|PlayStation/i.test(navigator.userAgent);
        chatEndRef.current?.scrollIntoView({ behavior: isTV ? 'auto' : 'smooth' });
    }, [messages, isLoading, isKeyboardVisible]);

    const doSearch = async (query: string) => {
        if (!query || isLoading || !ai) return;

        const userMessage: ChatMessage = { id: `user-${Date.now()}`, role: 'user', content: query, isNew: false };
        setMessages(prev => [...prev, userMessage]);
        setSearchResults([]);
        setInput('');
        setIsLoading(true);
        setIsKeyboardVisible(false); // Hide keyboard on search

        try {
            const response = await ai.models.generateContent({
                model: "gemini-3.5-flash",
                contents: userMessage.content,
                config: {
                    systemInstruction,
                },
            });

            // Parse JSON response
            let jsonResponse;
            try {
                let jsonText = response.text.trim();
                const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    jsonText = jsonMatch[0];
                    jsonResponse = JSON.parse(jsonText);
                } else {
                    throw new Error("No JSON object found in response");
                }
            } catch (e) {
                console.error("Failed to parse JSON from AI response", e, "Response text:", response.text);
                // Fallback to plain text if JSON parsing fails
                jsonResponse = {
                    response_type: "chat",
                    chat_message: response.text || "I couldn't quite figure out what you're looking for. Could you try describing it differently?",
                    recommendations: []
                };
            }

            const responseType = jsonResponse.response_type || "chat";
            const chatMsg = jsonResponse.chat_message || "";

            // Add the AI's response message to the chat
            setMessages(prev => [...prev, {
                id: `model-${Date.now()}`,
                role: 'model',
                content: chatMsg,
                isNew: true
            }]);

            if (responseType === "search") {
                const candidates: { title: string; media_type: 'movie' | 'tv' }[] = jsonResponse.recommendations || [];
                if (candidates.length > 0) {
                    // Stage 2 & 3: Search TMDB and set results
                    const tmdbPromises = candidates.map(candidate =>
                        fetchFromTMDB(`/search/${candidate.media_type}`, { query: candidate.title })
                            .then(res => res.results?.[0] ? { ...res.results[0], media_type: candidate.media_type } : null) // Take top result and ensure media_type
                            .catch(() => null)
                    );

                    const tmdbResults = await Promise.all(tmdbPromises);
                    const validResults = tmdbResults.filter((item): item is Movie => !!(item && item.backdrop_path));
                    setSearchResults(validResults);
                }
            }
        } catch (error) {
            console.error("Error with AI search:", error);
            setMessages(prev => [...prev, { id: `catch-error-${Date.now()}`, role: 'model', content: "Sorry, I encountered an error. Please try again.", isNew: true }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        doSearch(input);
    };

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (isKeyboardVisible) {
            e.preventDefault();
            if (e.key === 'ArrowDown') {
                const firstKey = document.querySelector('[data-row="0"][data-col="0"]') as HTMLElement | null;
                firstKey?.focus();
            } else if (e.key === 'Enter') {
                doSearch(input);
            }
        }
    };
    
    if (!ai) {
        return (
             <Layout>
                <div className="pt-24 px-4 flex justify-center text-center">
                    <div className="w-full max-w-2xl bg-[var(--surface)] rounded-2xl p-8">
                        <h2 className="text-2xl font-bold text-red-500">
                            {t('languageName') === 'العربية' ? 'خطأ في الإعداد' : 'Configuration Error'}
                        </h2>
                        <p className="mt-4 text-zinc-300">
                            {t('languageName') === 'العربية' 
                                ? 'مفتاح Gemini API غير مهيأ. يرجى إضافة مفتاح Gemini API الخاص بك في قسم "إدارة الملفات الشخصية" لتعديل ملفك الشخصي والتمكن من استخدام هذه الميزة.' 
                                : 'The Gemini API key is not configured. Please add your own Gemini API key under "Manage Profiles" (Edit Profile) to use this feature.'}
                        </p>
                    </div>
                </div>
            </Layout>
        )
    }

    return (
        <Layout>
            <div className="pt-24 px-4 flex justify-center">
                <div 
                    className="w-full max-w-3xl flex flex-col" 
                    style={{ 
                        height: 'calc(100vh - 6rem)',
                        paddingBottom: isKeyboardVisible ? '280px' : '0',
                        transition: 'padding-bottom 0.3s ease-out'
                    }}
                >
                    <main className="flex-1 overflow-y-auto p-4 no-scrollbar">
                        <div className="space-y-4">
                            {messages.map((msg) => (
                                <ChatMessageRow 
                                    key={msg.id} 
                                    msg={msg} 
                                    onComplete={() => handleMessageAnimationComplete(msg.id)} 
                                />
                            ))}

                            {isLoading && messages[messages.length - 1]?.role !== 'model' && (
                                <div className="flex gap-3 animate-fade-in-up justify-start">
                                    <AILogo />
                                    <div className="max-w-md lg:max-w-2xl rounded-2xl p-4 bg-zinc-800 rounded-bl-none">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 bg-zinc-400 rounded-full animate-[pulse_1.5s_infinite_0.1s]"></div>
                                            <div className="w-2 h-2 bg-zinc-400 rounded-full animate-[pulse_1.5s_infinite_0.2s]"></div>
                                            <div className="w-2 h-2 bg-zinc-400 rounded-full animate-[pulse_1.5s_infinite_0.3s]"></div>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div ref={chatEndRef} />
                        </div>  
   
                        {searchResults.length > 0 && (
                            <div className="mt-6 pt-6 border-t border-zinc-700/50">
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {searchResults.map((movie, index) => <SearchResultCard key={movie.id} movie={movie} index={index} />)}
                                </div>
                            </div>
                        )}
                    </main>

                    <footer className="p-4 flex-shrink-0">
                        <form onSubmit={handleFormSubmit} className="flex items-center gap-3">
                            <input
                                ref={inputRef}
                                type="text"
                                value={input}
                                onFocus={() => setIsKeyboardVisible(true)}
                                readOnly
                                onKeyDown={handleInputKeyDown}
                                placeholder={t('aiSearchPlaceholder')}
                                className="flex-1 bg-zinc-700 h-12 px-4 rounded-full text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focusable"
                                disabled={isLoading}
                            />
                            <button type="submit" disabled={isLoading || !input.trim()} className="w-12 h-12 bg-[var(--primary)] rounded-full flex items-center justify-center text-white disabled:bg-zinc-600 btn-press focusable">
                                <i className="fa-solid fa-arrow-up text-lg"></i>
                            </button>
                        </form>
                    </footer>
                </div>
            </div>
            {isKeyboardVisible && (
                <VirtualKeyboard
                    isVisible={isKeyboardVisible}
                    onInput={(char) => setInput(prev => prev + char)}
                    onBackspace={() => setInput(prev => prev.slice(0, -1))}
                    onClose={() => {
                        setIsKeyboardVisible(false);
                        inputRef.current?.blur();
                    }}
                    onFocusUp={() => inputRef.current?.focus()}
                />
            )}
        </Layout>
    );
};

export default AISearchPage;
