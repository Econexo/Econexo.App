import React from 'react';

interface ProfileHeaderProps {
    profileImage: string;
    userName: string;
    userRole: string;
    isLeyRep: boolean;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    onImageChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const ProfileHeader: React.FC<ProfileHeaderProps> = ({
    profileImage,
    userName,
    userRole,
    isLeyRep,
    fileInputRef,
    onImageChange,
}) => {
    return (
        <div className="relative pt-12 pb-8 flex flex-col items-center border-b border-white/40 dark:border-white/10 overflow-hidden bg-white/30 dark:bg-slate-900/30 backdrop-blur-sm transition-colors">
            {/* Background Image Layer */}
            <div className="absolute inset-0 z-0 opacity-50">
                <img
                    src="/assets/profile_eco_bg.png"
                    className="w-full h-full object-cover scale-105"
                    alt=""
                />
                <div className="absolute inset-0 bg-gradient-to-b from-white/40 via-white/80 to-[#f0f4f0] dark:from-slate-900/40 dark:via-slate-900/80 dark:to-slate-950 backdrop-blur-[1px]"></div>
            </div>

            <div className="relative z-10 flex flex-col items-center">
                <div className="relative mb-4 group">
                    <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl group-hover:bg-primary/30 transition-all"></div>
                    <img src={profileImage} className="relative size-24 rounded-full border-4 border-white shadow-2xl object-cover" alt="Avatar" />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="absolute bottom-0 right-0 p-2 bg-primary rounded-full text-white border-2 border-white shadow-lg transform active:scale-90 transition-transform z-20"
                    >
                        <span className="material-symbols-outlined text-sm font-bold">photo_camera</span>
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={onImageChange}
                        accept="image/*"
                        className="hidden"
                    />
                </div>
                <h3 className="text-2xl font-display font-black tracking-tight text-gray-900 dark:text-white drop-shadow-sm transition-colors">{userName}</h3>
                <p className="text-[11px] text-gray-600 font-black uppercase tracking-[0.2em] mt-1 drop-shadow-sm bg-white/50 px-3 py-0.5 rounded-full backdrop-blur-sm border border-white/40">
                    {userRole}
                </p>

                {/* Ley REP Status Tag */}
                <div className={`mt-5 px-5 py-2 rounded-full border flex items-center gap-2 transition-all shadow-lg backdrop-blur-md ${isLeyRep ? 'bg-primary/20 border-primary/30 text-primary shadow-primary/10' : 'bg-blue-500/20 border-blue-500/30 text-blue-500 shadow-blue-500/10'}`}>
                    <span className="material-symbols-outlined text-[18px] font-bold">{isLeyRep ? 'verified' : 'eco'}</span>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                        {isLeyRep ? 'EMPRESA LEY REP' : 'IMPACTO VOLUNTARIO'}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default ProfileHeader;
