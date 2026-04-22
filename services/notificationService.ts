import { supabase } from './supabase';

export interface NotificationData {
    userId: string;
    title: string;
    message: string;
    type: 'document' | 'certificate' | 'withdrawal' | 'report' | 'account';
    metadata?: any;
}

export const createNotification = async (data: NotificationData) => {
    try {
        const { error } = await supabase.from('notifications').insert([
            {
                user_id: data.userId,
                title: data.title,
                message: data.message,
                type: data.type,
                metadata: data.metadata || {},
                read: false,
            },
        ]);

        if (error) {
            console.error('Error creating notification:', error);
            return { success: false, error };
        }

        await Promise.allSettled([
            supabase.functions.invoke('send-push', {
                body: {
                    userId: data.userId,
                    title: data.title,
                    body: data.message,
                    url: '/dashboard',
                    data: data.metadata || {},
                },
            }),
            supabase.functions.invoke('send-email', {
                body: {
                    userId: data.userId,
                    type: data.type,
                    title: data.title,
                    message: data.message,
                    metadata: data.metadata || {},
                },
            }),
        ]);

        return { success: true };
    } catch (err) {
        console.error('Unexpected error creating notification:', err);
        return { success: false, error: err };
    }
};

export const markNotificationAsRead = async (notificationId: string) => {
    try {
        const { error } = await supabase
            .from('notifications')
            .update({ read: true })
            .eq('id', notificationId);

        if (error) {
            console.error('Error marking notification as read:', error);
            return { success: false, error };
        }

        return { success: true };
    } catch (err) {
        console.error('Unexpected error marking notification as read:', err);
        return { success: false, error: err };
    }
};

export const markAllNotificationsAsRead = async (userId: string) => {
    try {
        const { error } = await supabase
            .from('notifications')
            .update({ read: true })
            .eq('user_id', userId)
            .eq('read', false);

        if (error) {
            console.error('Error marking all notifications as read:', error);
            return { success: false, error };
        }

        return { success: true };
    } catch (err) {
        console.error('Unexpected error marking all notifications as read:', err);
        return { success: false, error: err };
    }
};

export const getNotifications = async (userId: string, limit = 20) => {
    try {
        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('Error fetching notifications:', error);
            return { success: false, error, data: [] };
        }

        return { success: true, data: data || [] };
    } catch (err) {
        console.error('Unexpected error fetching notifications:', err);
        return { success: false, error: err, data: [] };
    }
};
