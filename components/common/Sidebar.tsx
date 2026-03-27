
import React, { FC, useState } from 'react';
import { useAppStore } from '@/store/store';
import { APP_VIEWS, ICONS } from '@/constants';
import type { ViewName } from '@/types';
import { getAuth } from '@/src/services/firebase';
import { Menu, ChevronLeft, ChevronRight } from 'lucide-react';

const Sidebar: FC = () => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const activeView = useAppStore(state => state.activeView);
    const currentUser = useAppStore(state => state.currentUser);
    const theme = useAppStore(state => state.theme);
    const activeModel = useAppStore(state => state.activeModel);
    const logs = useAppStore(state => state.logs);
    const apiCallCount = useAppStore(state => state.apiCallCount);
    const processJobs = useAppStore(state => state.processJobs);

    const { 
        handleNavigationRequest,
        toggleTheme,
        setActiveModel,
        showModal,
        toggleMonitor,
        toggleProcessMonitor
    } = useAppStore.getState();

    const handleLogout = async () => {
        const auth = getAuth();
        await auth.signOut();
    };

    const navItems = Object.entries(APP_VIEWS).filter(([key, view]) => {
        if (view.hideFromSidebar) return false;
        if (currentUser?.isAdmin) return true;
        if (currentUser?.allowedViews && currentUser.allowedViews.length > 0) {
            return currentUser.allowedViews.includes(key as ViewName) || key === 'intelligent-sales-hub' || key === 'sales-intel-center' || key === 'roofing-estimator';
        }
        return !view.admin;
    });

    const activeJob = processJobs.find(j => j.status === 'running');
    const latestLog = logs.length > 0 ? logs[logs.length - 1] : null;

    return (
        <aside id="sidebar-nav" className={`flex-shrink-0 ${isCollapsed ? 'w-16' : 'w-64'} bg-bg-secondary flex flex-col border-r border-border-color no-print h-screen transition-all duration-300 relative`}>
            <button 
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="absolute -right-3 top-6 bg-bg-secondary border border-border-color rounded-full p-1 z-10 hover:bg-surface"
            >
                {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>

            {currentUser?.isBypassUser && !isCollapsed && (
                <div className="p-2 text-center bg-loss-bg text-white rounded-none text-sm font-bold animate-pulse">
                    <p>EMERGENCY BYPASS MODE</p>
                </div>
            )}
            <div className={`p-4 text-center border-b border-border-color ${isCollapsed ? 'hidden' : 'block'}`}>
                <img src="https://i.imgur.com/0Yw1FxJ.png" alt="Mont Azul Logo" className="h-20 w-20 mx-auto mb-2"/>
                <h1 className="text-lg font-bold text-text-primary">Mont Azul Intel Hub</h1>
                <p className="text-xs text-text-secondary truncate">{currentUser?.email}</p>
                {currentUser?.isAdmin && <p className="text-xs font-bold text-secondary">Administrator</p>}
            </div>
            
            {isCollapsed && (
                <div className="p-4 text-center border-b border-border-color flex justify-center">
                    <img src="https://i.imgur.com/0Yw1FxJ.png" alt="Mont Azul Logo" className="h-8 w-8"/>
                </div>
            )}
            
            <nav className="flex-grow overflow-y-auto p-2 space-y-1 overflow-x-hidden">
                {navItems.map(([key, view]) => (
                    <button
                        key={key}
                        onClick={() => handleNavigationRequest(key as ViewName)}
                        className={`nav-button w-full flex items-center gap-3 ${activeView === key ? 'active' : ''} ${isCollapsed ? 'justify-center px-0' : ''}`}
                        title={isCollapsed ? view.title : undefined}
                    >
                        <div className="flex-shrink-0">{view.icon}</div>
                        {!isCollapsed && <span className="truncate">{view.title}</span>}
                    </button>
                ))}
            </nav>

            <div className="border-t border-border-color">
                {/* Integrated Mini Monitor */}
                {activeJob && !isCollapsed && (
                    <div className="px-3 py-2 bg-surface border-b border-border-color cursor-pointer hover:bg-bg-primary" onClick={toggleProcessMonitor}>
                        <div className="flex justify-between items-center text-[10px] mb-1">
                            <span className="font-bold truncate text-primary w-32">{activeJob.name}</span>
                            <span>{Math.round(activeJob.progress)}%</span>
                        </div>
                        <div className="h-1 bg-bg-secondary rounded-full overflow-hidden">
                            <div className="h-full bg-primary transition-all duration-300" style={{ width: `${activeJob.progress}%` }}></div>
                        </div>
                    </div>
                )}
                
                <div 
                    className={`px-3 py-2 flex items-center justify-between text-xs border-b border-border-color cursor-pointer hover:bg-surface transition-colors ${isCollapsed ? 'justify-center' : ''}`} 
                    onClick={toggleMonitor}
                    title="System Status"
                >
                    <div className={`flex items-center gap-2 bg-primary/10 px-2 py-1 rounded-md ${isCollapsed ? 'w-auto' : 'w-full'}`}>
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${latestLog?.type === 'ERR' ? 'bg-red-500' : 'bg-green-500'} ${activeJob ? 'animate-pulse' : ''}`}></span>
                        {!isCollapsed && <span className="font-mono font-bold text-primary truncate">API: {apiCallCount}</span>}
                        {!isCollapsed && <span className="truncate max-w-[80px] ml-auto text-[10px] opacity-70 text-text-secondary">{latestLog?.type || 'Ready'}</span>}
                    </div>
                </div>

                <div className={`p-2 space-y-2 ${isCollapsed ? 'hidden' : 'block'}`}>
                     <div className="form-group px-2">
                        <label className="text-[10px] text-text-secondary uppercase font-bold">AI Model Engine</label>
                        <select
                            value={activeModel}
                            onChange={(e) => setActiveModel(e.target.value)}
                            className="w-full text-xs font-semibold py-1"
                        >
                            <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro</option>
                            <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (Custom Tools)</option>
                            <option value="gemini-3.1-pro-preview">Gemini 3.0 Flash</option>
                        </select>
                    </div>
                     <div className="flex justify-around items-center">
                        <button onClick={() => showModal({ type: 'SupervisorFeedback', title: 'Supervisor Feedback' })} className="btn tertiary !p-2 text-purple-400 hover:bg-purple-900/20" title="Supervisor Feedback">{ICONS.SUPERVISOR}</button>
                        <button onClick={toggleTheme} className="btn tertiary !p-2" title="Toggle Theme">{theme === 'dark' ? 
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m8.66-15.66l-.707.707M4.04 19.96l-.707.707M21 12h-1M4 12H3m15.66 8.66l-.707-.707M4.04 4.04l-.707-.707"></path></svg> : 
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
                        }</button>
                    </div>
                    <button onClick={handleLogout} className="btn secondary w-full text-xs py-1">Logout</button>
                </div>
                {isCollapsed && (
                    <div className="p-2 flex flex-col items-center space-y-2">
                        <button onClick={toggleTheme} className="btn tertiary !p-2" title="Toggle Theme">{theme === 'dark' ? 
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m8.66-15.66l-.707.707M4.04 19.96l-.707.707M21 12h-1M4 12H3m15.66 8.66l-.707-.707M4.04 4.04l-.707-.707"></path></svg> : 
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
                        }</button>
                        <button onClick={handleLogout} className="btn secondary !p-2 text-xs" title="Logout">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                        </button>
                    </div>
                )}
            </div>
        </aside>
    );
};

export default Sidebar;
