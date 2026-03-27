import type { User } from '@/types';
import type { StateCreator } from 'zustand';
import type { AppState } from '../store';

export interface AuthSlice {
    currentUser: User | null;
    allUsers: User[];
    setCurrentUser: (user: User | null) => void;
    performBypassLogin: () => void;
}

export const createAuthSlice: StateCreator<AppState, [], [], AuthSlice> = (set, get) => ({
    currentUser: null,
    allUsers: [],
    setCurrentUser: (user) => {
        set({ currentUser: user });
        if (user && !user.isBypassUser) {
            // If it's a real user, fetch their data
            get().fetchPrimaryData();
            get().fetchSettings();
        } else if (!user) { // on logout
            // Clear user-specific data on logout
            set({
                customerDirectory: [], projectPipeline: [], savedLeads: [], activeSearches: [], allUsers: [],
                clicksendConfig: null, clicksendBalance: null, emailProvider: null, mailRelayHostname: null, mailRelayApiKey: null,
                lastFetchedData: null // Also clear the fetch timestamp
            });
        }
        // If it's a bypass user, do nothing here. The app will use cached data from localStorage.
    },
    performBypassLogin: () => {
        get().logEvent('SYS', 'Bypass authentication successful. Creating temporary offline session.');
        const bypassUser: User = {
            uid: 'bypass-user-01',
            email: 'offline@montazul.com',
            displayName: 'Bypass User (Offline)',
            isAdmin: false, // Crucially, bypass users are NOT admins
            status: 'approved',
            // Provide a default set of allowed views for bypass mode
            allowedViews: ['dashboard', 'new-quote', 'lead-intel', 'contacts'],
            isBypassUser: true,
        };
        // Use existing setCurrentUser to trigger the app's logged-in state
        get().setCurrentUser(bypassUser);
    },
});