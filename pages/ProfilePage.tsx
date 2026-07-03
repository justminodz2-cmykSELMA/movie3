import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '../contexts/ProfileContext';
import { useTranslation } from '../contexts/LanguageContext';
import { Profile } from '../types';
import { motion } from 'motion/react';
import { getToken, logout } from '../services/authService';
import { disableGuestMode } from '../components/AuthGuard';

const PROFILE_AVATARS = [
    // Netflix Classics (Hosted on Imgur)
    'https://upload.wikimedia.org/wikipedia/commons/0/0b/Netflix-avatar.png', // Robot
    'https://wallpapers.com/images/hd/netflix-profile-pictures-1000-x-1000-88wkdmjrorckekha.jpg', // Yellow happy face
    'https://i.pinimg.com/564x/1b/a2/e6/1ba2e6d1d4874546c70c91f1024e17fb.jpg', // Red angry face
    'https://i.pinimg.com/736x/ec/74/7a/ec747a688a5d6232663caaf114bad1c3.jpg', // Blue neutral face
    'https://i.pinimg.com/originals/b6/77/cd/b677cd1cde292f261166533d6fe75872.png', // Green curious face
    'https://i.pinimg.com/474x/60/80/81/60808105ca579916a1b3eda8768dd570.jpg', // Chicken
    'https://stories.infobae.com/wp-content/uploads/2022/02/perfil-1.png', // Penguin
    'https://i.pinimg.com/736x/92/b4/e7/92b4e7c57de1b5e1e8c5e883fd915450.jpg', // Purple monster

    // Show-inspired Avatars (Hosted on Imgur)
    'https://i.pinimg.com/236x/b3/bb/f6/b3bbf6285f20622e5dae9a31f0afe8c6.jpg', // Money Heist mask
    'https://i.pinimg.com/236x/d0/53/b6/d053b6982d5cdce532533ff4aac869b5.jpg', // Geralt (Witcher)
    'https://external-preview.redd.it/yble0xDFerMYRYRz9uUgrVhnBrzVULNvCX38QH1za_U.jpg?auto=webp&s=1fc278147524128e733102857f9834a857047ab3', // Squid Game Guard
    'https://wallpapers.com/images/featured/netflix-profile-pictures-w3lqr61qe57e9yt8.jpg', // Queen (Bridgerton)
    'https://wallpapers.com/images/hd/netflix-profile-pictures-1000-x-1000-62wgyitks6f4l79m.jpg', // Big Mouth
    'https://wallpapers.com/images/hd/netflix-profile-pictures-1000-x-1000-2fg93funipvqfs9i.jpg', // Demogorgon (Stranger Things)
    'https://loodibee.com/wp-content/uploads/Netflix-avatar-8.png', // Carmen Sandiego
    'https://loodibee.com/wp-content/uploads/Netflix-avatar-7.png', // Bojack Horseman

    // Cute & Fun (Hosted on Imgur)
    'https://loodibee.com/wp-content/uploads/Netflix-avatar-3.png', // Troll Hunters Gnome
    'https://i.imgur.com/5K7pQ2X.png', // Storybots
    'https://i.imgur.com/8P2kH5V.png', // Boss Baby
    'https://i.imgur.com/2Fq9L0T.png', // Ninja
    'https://i.imgur.com/4Wk8S1M.png', // Astronaut
    'https://i.imgur.com/9Gv7H2J.png', // Pirate
    'https://img.freepik.com/premium-vector/angry-cartoon-monster-face-vector-halloween-monster-square-avatar-isolated_6996-1459.jpg', // Cat
    'https://img.freepik.com/premium-vector/funny-green-face-square-avatar-cartoon-emotion-icon_53562-16129.jpg', // Dog
    'https://loodibee.com/wp-content/uploads/Netflix-avatar-4.png', // Panda
];

// Kids avatar (also hosted on Imgur)
const KIDS_AVATAR = 'https://loodibee.com/wp-content/uploads/Netflix-avatar-10.png';

const ProfileCard: React.FC<{
    profile?: Profile;
    isAddButton?: boolean;
    onClick: () => void;
    isManaging?: boolean;
    activeWormId: string | null;
    setActiveWormId: (id: string | null) => void;
}> = ({ profile, isAddButton = false, onClick, isManaging = false, activeWormId, setActiveWormId }) => {
    const { t } = useTranslation();
    const baseClasses = "flex flex-col items-center gap-2 group cursor-pointer w-28 md:w-36 text-center focusable profile-card-btn";
    const imageContainerClasses = "w-full aspect-square rounded-md relative transition-all duration-300";
    const imageClasses = "w-full h-full object-cover";
    const nameClasses = "text-gray-400 group-hover:text-white transition-colors text-lg truncate w-full";
    
    if (isAddButton) {
        return (
            <div 
                className={baseClasses} 
                onClick={onClick} 
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        onClick();
                    }
                }} 
                tabIndex={0}
            >
                <div className={`${imageContainerClasses} overflow-hidden flex items-center justify-center group-hover:scale-105 group-focus-within:scale-105`}>
                     <div className="w-full h-full flex items-center justify-center bg-transparent group-hover:bg-zinc-800 group-focus-within:bg-zinc-800 transition-colors rounded-md">
                        <i className="fas fa-plus-circle text-6xl md:text-8xl text-gray-400 group-hover:text-white group-focus-within:text-white transition-colors"></i>
                    </div>
                </div>
                <span className={nameClasses}>{t('addProfile')}</span>
            </div>
        );
    }
    
    if (!profile) return null;

    const isKids = profile?.type === 'KIDS';
    const isWormActive = isKids && activeWormId === profile.id;
    
    return (
        <div 
            className={baseClasses} 
            onClick={onClick} 
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    onClick();
                }
            }} 
            tabIndex={0}
            onMouseEnter={() => isKids && setActiveWormId(profile.id)}
            onFocus={() => isKids && setActiveWormId(profile.id)}
        >
            <div className={`${imageContainerClasses} ${isManaging ? 'border-2 border-transparent group-hover:border-white group-focus-within:border-white' : 'group-hover:scale-105 group-focus-within:scale-105'}`}>
                {/* Dynamic smooth physics-based rotating worm border */}
                {isWormActive && (
                    <motion.div
                        layoutId="kidsWormBorder"
                        className="absolute -inset-[3.5px] rounded-[10px] overflow-hidden pointer-events-none"
                        style={{ zIndex: 0 }}
                        transition={{
                            type: "spring",
                            stiffness: 90,
                            damping: 12,
                            mass: 1.4
                        }}
                    >
                        <div 
                            className="absolute"
                            style={{
                                background: 'conic-gradient(from 0deg, transparent 0%, transparent 60%, #fbbf24 80%, #b45309 100%)',
                                animation: 'border-worm 2s linear infinite',
                                width: '300%',
                                height: '300%',
                                top: '-100%',
                                left: '-100%'
                            }}
                        />
                    </motion.div>
                )}
                <div className="relative z-10 w-full h-full rounded-md overflow-hidden bg-[var(--surface)]">
                    <img src={profile.avatar} alt={profile.name} className={imageClasses} />
                    {isManaging && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                            <i className="fas fa-pencil-alt text-4xl text-white"></i>
                        </div>
                    )}
                </div>
            </div>
            <span className={nameClasses}>{profile.name}</span>
        </div>
    );
};

const AvatarGrid: React.FC<{ onSelect: (avatar: string) => void; onBack: () => void; }> = ({ onSelect, onBack }) => {
    const { t } = useTranslation();
    return (
        <div className="flex flex-col items-center min-h-screen p-4 text-white animate-fade-in bg-transparent">
             <div className="absolute top-4 left-4">
                 <img 
                     src="https://i.ibb.co/Vc2jxqRR/Chat-GPT-Image-Jul-1-2026-01-37-52-PM.png" 
                     alt="Logo" 
                     className="w-14 h-14 object-contain" 
                 />
             </div>
            <div className="w-full max-w-5xl mt-24">
                 <button onClick={onBack} className="flex items-center gap-2 text-zinc-300 hover:text-white transition-colors text-lg mb-4 focusable">
                     <i className="fas fa-arrow-left"></i>
                     <span>{t('editProfile')}</span>
                 </button>
                 <h1 className="text-4xl md:text-5xl font-normal border-b border-gray-700 pb-4">{t('chooseNewAvatar')}</h1>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-4 w-full max-w-5xl mt-8">
                {PROFILE_AVATARS.map(avatar => (
                    <div 
                        key={avatar} 
                        tabIndex={0} 
                        onClick={() => onSelect(avatar)} 
                        onKeyDown={(e) => { 
                            if (e.key === 'Enter') { 
                                e.preventDefault(); 
                                e.stopPropagation(); 
                                onSelect(avatar); 
                            } 
                        }} 
                        className="aspect-square rounded-md overflow-hidden cursor-pointer transition-transform hover:scale-110 border-4 border-transparent hover:border-white focusable focus:scale-110 focus:border-white outline-none"
                    >
                        <img src={avatar} alt="avatar" className="w-full h-full object-cover"/>
                    </div>
                ))}
            </div>
        </div>
    )
}

const ProfilePage: React.FC = () => {
    const navigate = useNavigate();
    const { accountData, selectProfile, activeProfile, addProfile, updateProfile, deleteProfile, setToast } = useProfile();
    const { t } = useTranslation();
    
    const [view, setView] = useState<'select' | 'form'>('select');
    const [isManaging, setIsManaging] = useState(false);
    const [profileToEdit, setProfileToEdit] = useState<Profile | null>(null);
    const [showAvatarPicker, setShowAvatarPicker] = useState(false);

    const [activeWormId, setActiveWormId] = useState<string | null>(null);
    const isLoggedIn = !!getToken();

    // Auto-focus the first focusable element when view, isManaging, or showAvatarPicker changes to keep D-pad focus active
    useEffect(() => {
        const timer = setTimeout(() => {
            if (view === 'form' && !showAvatarPicker) {
                // Focus the name input
                const nameInput = document.querySelector('input[type="text"]') as HTMLElement;
                if (nameInput) {
                    nameInput.focus();
                    return;
                }
            }
            const firstFocusable = document.querySelector('.focusable') as HTMLElement;
            if (firstFocusable) {
                firstFocusable.focus();
            }
        }, 150);
        return () => clearTimeout(timer);
    }, [view, isManaging, showAvatarPicker]);

    // Automatically set initial activeWormId to the first KIDS profile if available
    useEffect(() => {
        if (accountData?.screens) {
            const firstKids = accountData.screens.find(p => p.type === 'KIDS');
            if (firstKids && !activeWormId) {
                setActiveWormId(firstKids.id);
            }
        }
    }, [accountData, activeWormId]);

    // Form state
    const [name, setName] = useState('');
    const [isKids, setIsKids] = useState(false);
    const [avatar, setAvatar] = useState('');
    const [geminiApiKey, setGeminiApiKey] = useState('');

    useEffect(() => {
        if (activeProfile) {
            navigate('/home', { replace: true });
        } else if (!accountData) {
            // Loading state
        } else if (accountData.screens.length === 0) {
            setView('form');
            setProfileToEdit(null);
            setIsManaging(false);
        } else {
            setView('select');
        }
    }, [activeProfile, accountData, navigate]);
    
    useEffect(() => {
        if (view === 'form') {
            if (profileToEdit) { // Editing
                setName(profileToEdit.name);
                setIsKids(profileToEdit.type === 'KIDS');
                setAvatar(profileToEdit.avatar);
                setGeminiApiKey(profileToEdit.geminiApiKey || '');
            } else { // Adding
                setName('');
                setIsKids(false);
                setGeminiApiKey('');
                const usedAvatars = accountData?.screens.map(p => p.avatar) || [];
                const availableAvatars = PROFILE_AVATARS.filter(a => !usedAvatars.includes(a) && a !== KIDS_AVATAR);
                const randomAvatar = availableAvatars.length > 0
                    ? availableAvatars[Math.floor(Math.random() * availableAvatars.length)]
                    : PROFILE_AVATARS[Math.floor(Math.random() * PROFILE_AVATARS.length)];
                setAvatar(randomAvatar);
            }
        }
    }, [view, profileToEdit, accountData?.screens]);


    const handleSelectProfile = (id: string) => {
        if (isManaging) {
            const profile = accountData?.screens.find(p => p.id === id);
            if(profile) {
                setProfileToEdit(profile);
                setView('form');
            }
        } else {
            selectProfile(id);
        }
    };
    
    const handleAddProfileClick = () => {
        setProfileToEdit(null);
        setView('form');
    };
    
    const handleCancelForm = () => {
        if (accountData?.screens.length === 0) return;
        setView('select');
        setProfileToEdit(null);
        setIsManaging(false);
    };

    const handleSaveForm = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        if (profileToEdit) {
            updateProfile(profileToEdit.id, {
                name: name.trim(),
                type: isKids ? 'KIDS' : 'ADULT',
                avatar: avatar,
                geminiApiKey: geminiApiKey.trim()
            });
        } else {
            addProfile({ name: name.trim(), type: isKids ? 'KIDS' : 'ADULT', avatar: avatar, geminiApiKey: geminiApiKey.trim() });
        }
        setView('select');
        setProfileToEdit(null);
        setIsManaging(false);
    };

    const handleDeleteProfile = () => {
        if (profileToEdit && (accountData?.screens.length ?? 0) > 1) {
             if (window.confirm(t('deleteProfileConfirm', { name: profileToEdit.name }))) {
                deleteProfile(profileToEdit.id);
                setView('select');
                setProfileToEdit(null);
                setIsManaging(false);
            }
        } else {
            setToast({ message: t('lastProfileError'), type: 'error' });
        }
    };
    
    const handleLogout = async () => {
        await logout();
        disableGuestMode();
        setToast({ message: 'Logged out', type: 'info' });
        navigate('/login', { replace: true });
    };

    if (!accountData) {
        return <div className="flex items-center justify-center h-screen bg-transparent text-white text-xl">{t('loadingProfiles')}</div>;
    }

    if (view === 'form') {
        const isEditing = !!profileToEdit;

        if (showAvatarPicker) {
            return <AvatarGrid
                onBack={() => setShowAvatarPicker(false)}
                onSelect={(newAvatar) => {
                    setAvatar(newAvatar);
                    setShowAvatarPicker(false);
                }}
            />
        }

        if (isEditing) {
            // Edit Profile Screen
             return (
                <div className="flex flex-col items-center justify-center min-h-screen p-4 text-white animate-fade-in bg-transparent">
                    <div className="absolute top-4 left-4">
                        <img 
                            src="https://i.ibb.co/Vc2jxqRR/Chat-GPT-Image-Jul-1-2026-01-37-52-PM.png" 
                            alt="Logo" 
                            className="w-14 h-14 object-contain" 
                        />
                    </div>
                    <form onSubmit={handleSaveForm} className="w-full max-w-2xl">
                        <h1 className="text-4xl md:text-5xl font-normal mb-6">{t('editProfile')}</h1>
                        <div className="border-y border-gray-700 py-6">
                            <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
                                <div 
                                    tabIndex={0} 
                                    className="relative flex-shrink-0 group cursor-pointer focusable focus:scale-105 outline-none rounded-md" 
                                    onClick={() => setShowAvatarPicker(true)} 
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setShowAvatarPicker(true);
                                        }
                                    }}
                                >
                                    <img src={avatar} alt="Profile Avatar" className="w-28 h-28 md:w-36 md:h-36 rounded-md object-cover" />
                                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity rounded-md">
                                        <i className="fas fa-pencil-alt text-2xl text-white"></i>
                                    </div>
                                </div>
                                <div className="w-full space-y-5">
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        placeholder={t('name')}
                                        className="w-full bg-gray-600 px-4 py-3 text-lg text-white placeholder-gray-400 focus:outline-none rounded-sm focusable"
                                        required
                                        autoFocus
                                    />
                                     <div className="flex items-center gap-3">
                                        <input
                                            id="kids-checkbox"
                                            type="checkbox"
                                            checked={isKids}
                                            onChange={e => {
                                                const checked = e.target.checked;
                                                setIsKids(checked);
                                                if (checked) {
                                                    setAvatar(KIDS_AVATAR);
                                                }
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    const nextVal = !isKids;
                                                    setIsKids(nextVal);
                                                    if (nextVal) {
                                                        setAvatar(KIDS_AVATAR);
                                                    }
                                                }
                                            }}
                                            className="w-6 h-6 bg-gray-600 border-gray-500 rounded-sm focus:ring-0 focusable"
                                        />
                                        <label htmlFor="kids-checkbox" className="text-lg text-gray-300">{t('kidQuestionMark')}</label>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-gray-400">{t('languageLabel')}</label>
                                        <select className="bg-black border border-gray-400 text-white text-sm rounded-sm focus:ring-white focus:border-white block w-full p-2.5 focusable">
                                            <option>English</option>
                                            <option>العربية</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-gray-400">{t('maturitySettings')}</label>
                                        <div className="bg-gray-700 text-white font-semibold p-2 rounded-sm w-full text-left">{t('allMaturityRatings')}</div>
                                    </div>
                                    <div className="space-y-2">
                                        <label htmlFor="gemini-key-input-edit" className="text-gray-400">{t('geminiApiKeyLabel')}</label>
                                        <input
                                            id="gemini-key-input-edit"
                                            type="text"
                                            value={geminiApiKey}
                                            onChange={e => setGeminiApiKey(e.target.value)}
                                            placeholder={t('geminiApiKeyPlaceholder')}
                                            className="w-full bg-gray-600 px-4 py-3 text-lg text-white placeholder-gray-400 focus:outline-none rounded-sm focusable"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="mt-8 flex flex-col sm:flex-row items-center gap-4">
                            <button type="submit" className="w-full sm:w-auto px-10 py-2.5 text-lg font-semibold bg-white text-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-colors focusable">
                                {t('save')}
                            </button>
                            <button type="button" onClick={handleCancelForm} className="w-full sm:w-auto px-10 py-2.5 text-lg font-semibold bg-transparent text-gray-400 border border-gray-600 uppercase tracking-widest hover:border-white hover:text-white transition-colors focusable">
                                {t('cancel')}
                            </button>
                            <button type="button" onClick={handleDeleteProfile} className="w-full sm:w-auto px-10 py-2.5 text-lg font-semibold bg-transparent text-gray-400 border border-gray-600 uppercase tracking-widest hover:border-white hover:text-white transition-colors focusable">
                                {t('deleteProfile')}
                            </button>
                        </div>
                    </form>
                </div>
            );
        } else {
            // Add Profile Screen
            return (
                <div className="flex flex-col items-center justify-center min-h-screen p-4 text-white animate-fade-in bg-transparent">
                     <div className="absolute top-4 left-4">
                        <img 
                            src="https://i.ibb.co/Vc2jxqRR/Chat-GPT-Image-Jul-1-2026-01-37-52-PM.png" 
                            alt="Logo" 
                            className="w-14 h-14 object-contain" 
                        />
                    </div>
                    <form onSubmit={handleSaveForm} className="w-full max-w-2xl">
                        <h1 className="text-4xl md:text-5xl font-normal">{t('addProfile')}</h1>
                        <p className="text-lg text-gray-400 mt-2 mb-6">{t('addProfileSubtitle')}</p>
                        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 border-y border-gray-700 py-6">
                            <div 
                                tabIndex={0} 
                                className="relative flex-shrink-0 group cursor-pointer focusable focus:scale-105 outline-none rounded-md" 
                                onClick={() => setShowAvatarPicker(true)} 
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setShowAvatarPicker(true);
                                    }
                                }}
                            >
                                <img src={avatar} alt="Profile Avatar" className="w-28 h-28 md:w-36 md:h-36 rounded-md object-cover flex-shrink-0" />
                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity rounded-md">
                                    <i className="fas fa-pencil-alt text-2xl text-white"></i>
                                </div>
                            </div>
                            <div className="w-full">
                                <input
                                    type="text"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder={t('name')}
                                    className="w-full bg-gray-600 px-4 py-3 text-lg text-white placeholder-gray-400 focus:outline-none rounded-sm focusable"
                                    required
                                    autoFocus
                                />
                                <div className="flex items-center gap-3 mt-4">
                                    <input
                                        id="kids-checkbox"
                                        type="checkbox"
                                        checked={isKids}
                                        onChange={e => {
                                            const checked = e.target.checked;
                                            setIsKids(checked);
                                            if (checked) {
                                                setAvatar(KIDS_AVATAR);
                                            }
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                const nextVal = !isKids;
                                                setIsKids(nextVal);
                                                if (nextVal) {
                                                    setAvatar(KIDS_AVATAR);
                                                }
                                            }
                                        }}
                                        className="w-8 h-8 bg-gray-800 border-gray-600 focusable"
                                    />
                                    <label htmlFor="kids-checkbox" className="text-lg text-gray-300">{t('kidQuestionMark')}</label>
                                </div>
                                <div className="space-y-2 mt-4">
                                    <label htmlFor="gemini-key-input-add" className="text-gray-400">{t('geminiApiKeyLabel')}</label>
                                    <input
                                        id="gemini-key-input-add"
                                        type="text"
                                        value={geminiApiKey}
                                        onChange={e => setGeminiApiKey(e.target.value)}
                                        placeholder={t('geminiApiKeyPlaceholder')}
                                        className="w-full bg-gray-600 px-4 py-3 text-lg text-white placeholder-gray-400 focus:outline-none rounded-sm focusable"
                                    />
                                </div> </div>
                            </div>
                        <div className="mt-8 flex flex-col sm:flex-row items-center gap-4">
                            <button type="submit" className="w-full sm:w-auto px-10 py-3 text-xl font-semibold bg-red-600 text-white uppercase tracking-widest hover:bg-red-700 transition-colors focusable">
                                {t('continue')}
                            </button>
                            <button type="button" onClick={handleCancelForm} className="w-full sm:w-auto px-10 py-3 text-xl font-semibold bg-transparent text-gray-400 border border-gray-600 uppercase tracking-widest hover:border-white hover:text-white transition-colors focusable">
                                {t('cancel')}
                            </button>
                        </div>
                    </form>
                </div>
            );
        }
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-transparent text-center animate-fade-in">
            <h1 className="text-4xl md:text-5xl font-normal text-white mb-8">{isManaging ? t('manageProfiles') + ':' : t('whoIsWatching')}</h1>
            <div className="flex flex-wrap justify-center gap-4 sm:gap-6 md:gap-8 max-w-5xl mx-auto">
                {accountData.screens.map(profile => (
                    <ProfileCard 
                        key={profile.id}
                        profile={profile}
                        onClick={() => handleSelectProfile(profile.id)}
                        isManaging={isManaging}
                        activeWormId={activeWormId}
                        setActiveWormId={setActiveWormId}
                    />
                ))}
                {(accountData.screens.length < 5) && (
                    <ProfileCard 
                        isAddButton 
                        onClick={handleAddProfileClick} 
                        isManaging={isManaging}
                        activeWormId={activeWormId}
                        setActiveWormId={setActiveWormId}
                    />
                )}
            </div>
            {isLoggedIn ? (
                <div className="mt-16 flex flex-wrap items-center justify-center gap-4">
                    <button
                        onClick={() => setIsManaging(!isManaging)}
                        tabIndex={0}
                        className="px-8 py-2.5 text-lg font-normal bg-transparent text-gray-400 border border-gray-600 uppercase tracking-widest hover:border-white hover:text-white transition-colors focusable"
                    >
                        {isManaging ? t('done') : t('manageProfiles')}
                    </button>
                    <button
                        onClick={handleLogout}
                        tabIndex={0}
                        className="px-8 py-2.5 text-lg font-normal bg-transparent text-gray-400 border border-gray-600 uppercase tracking-widest hover:border-red-600 hover:text-red-500 transition-colors focusable"
                    >
                        <i className="fa-solid fa-right-from-bracket mr-2"></i>Log Out
                    </button>
                </div>
            ) : (
                <button
                    onClick={() => navigate('/login')}
                    tabIndex={0}
                    className="mt-16 px-8 py-2.5 text-lg font-normal bg-transparent text-gray-400 border border-gray-600 uppercase tracking-widest hover:border-white hover:text-white transition-colors focusable"
                >
                    <i className="fa-solid fa-right-to-bracket mr-2"></i>Log In
                </button>
            )}
        </div>
    );
};

export default ProfilePage;
