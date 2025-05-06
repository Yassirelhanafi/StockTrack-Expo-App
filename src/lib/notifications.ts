import React, { useEffect } from 'react';
import * as Notifications from 'expo-notifications';

const NotificationHandler = () => {
    useEffect(() => {
        // Demande la permission pour les notifications push
        const requestPermission = async () => {
            const { status } = await Notifications.requestPermissionsAsync();
            if (status !== 'granted') {
                alert('Permission to receive notifications was denied');
            } else {
                console.log('Notification permission granted');
            }
        };

        requestPermission();
    }, []);

    return null;
};

export default NotificationHandler;
