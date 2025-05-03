'use client';

import { useQuery } from '@tanstack/react-query';
import { getLowStockNotifications, type Notification } from '@/lib/firebase/firestore'; // Assuming a function to get notifications
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, BellRing, BellOff } from 'lucide-react';

export function NotificationsTab() {
  const { data: notifications, isLoading, error, refetch } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: getLowStockNotifications, // Use the specific function
    staleTime: 60 * 1000, // Cache for 1 minute
    refetchInterval: 2 * 60 * 1000 // Refetch every 2 minutes
  });

  return (
    <Card className="w-full shadow-md">
      <CardHeader>
        <CardTitle className="text-xl font-medium text-accent flex items-center">
          <BellRing className="mr-2 h-5 w-5" />
          Low Stock Alerts
        </CardTitle>
        <CardDescription>
          Products that require your attention and need restocking.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && (
           <div className="space-y-4">
             {[...Array(2)].map((_, i) => (
                <div key={i} className="flex items-start space-x-3 p-4 border rounded-md">
                    <Skeleton className="h-5 w-5 mt-1 rounded-full bg-accent/50" />
                    <div className="space-y-1 flex-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    </div>
                </div>
             ))}
           </div>
        )}
        {error && (
           <div className="text-destructive text-center p-6 bg-destructive/10 rounded-md">
             <AlertTriangle className="mx-auto h-8 w-8 mb-2" />
            <p>Error loading notifications: {(error as Error).message}</p>
            <button onClick={() => refetch()} className="mt-4 text-sm underline">Try again</button>
          </div>
        )}
        {!isLoading && !error && notifications && notifications.length === 0 && (
          <div className="text-center p-10 text-muted-foreground">
             <BellOff className="mx-auto h-12 w-12 mb-4" />
            <p className="text-lg font-medium">All Clear!</p>
            <p>No low stock notifications at the moment.</p>
          </div>
        )}
        {!isLoading && !error && notifications && notifications.length > 0 && (
          notifications.map((notification) => (
            <Alert key={notification.id} variant="destructive" className="border-accent bg-accent/10 text-accent-foreground dark:text-accent">
              <AlertTriangle className="h-4 w-4 text-accent" />
              <AlertTitle className="font-semibold text-accent">Low Stock: {notification.productName}</AlertTitle>
              <AlertDescription className="text-accent/90">
                Quantity dropped to {notification.quantity}. Please reorder soon. (ID: {notification.productId})
                <span className="block text-xs mt-1 text-accent/70">
                  Triggered on: {new Date(notification.timestamp.seconds * 1000).toLocaleString()}
                </span>
              </Description>
            </Alert>
          ))
        )}
      </CardContent>
    </Card>
  );
}
