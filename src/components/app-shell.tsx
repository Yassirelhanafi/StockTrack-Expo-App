'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScanTab } from '@/components/scan-tab';
import { ProductsTab } from '@/components/products-tab';
import { NotificationsTab } from '@/components/notifications-tab';
import { QrCode, List, Bell } from 'lucide-react';

export function AppShell() {
  return (
    <div className="flex min-h-screen w-full flex-col items-center bg-muted/40 p-4 md:p-8">
      <div className="w-full max-w-4xl">
        <h1 className="text-3xl font-semibold mb-6 text-center text-primary">
          StockTrack
        </h1>
        <Tabs defaultValue="scan" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="scan">
              <QrCode className="mr-2 h-4 w-4" />
              Scan
            </TabsTrigger>
            <TabsTrigger value="products">
              <List className="mr-2 h-4 w-4" />
              Products
            </TabsTrigger>
            <TabsTrigger value="notifications">
              <Bell className="mr-2 h-4 w-4" />
              Notifications
            </TabsTrigger>
          </TabsList>
          <TabsContent value="scan">
            <ScanTab />
          </TabsContent>
          <TabsContent value="products">
            <ProductsTab />
          </TabsContent>
          <TabsContent value="notifications">
            <NotificationsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
