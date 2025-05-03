'use client';

import type { FC } from 'react';
import { useState, useEffect, useRef } from 'react';
import { Html5QrcodeScanner, Html5Qrcode } from 'html5-qrcode';
import type { Html5QrcodeResult, QrcodeError } from 'html5-qrcode';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { addProduct, updateProductQuantity } from '@/lib/firebase/firestore';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, ScanLine, AlertTriangle } from 'lucide-react';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const QR_REGION_ID = 'qr-code-full-region';
const CONSUMPTION_RATE_REGEX = /^(\d+)\s*(per|every|/)\s*(day|week|month)$/i;
const LOW_STOCK_THRESHOLD = 10; // Define a threshold for low stock alerts

interface ProductData {
  id: string; // Assuming QR code contains a product ID
  name: string; // Assuming QR code contains a product name
  quantity: number;
  consumptionRate?: {
    amount: number;
    unit: 'day' | 'week' | 'month';
  };
}

export function ScanTab() {
  const [scanResult, setScanResult] = useState<ProductData | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { toast } = useToast();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (product: ProductData) => {
      // Check if product exists logic would go here if we had getProduct
      // For now, we assume we add or update directly
      try {
        await addProduct({
          id: product.id,
          name: product.name,
          quantity: product.quantity,
          consumptionRate: product.consumptionRate,
          lastUpdated: new Date(), // Add lastUpdated timestamp
        });
        return product;
      } catch (error: any) {
        // A more robust check would involve checking if error code means 'already exists'
        console.warn('Product might already exist, attempting update:', error);
        await updateProductQuantity(product.id, product.quantity); // Example: Update if add fails
        return product;
      }
    },
    onSuccess: (data) => {
      toast({
        title: 'Success!',
        description: `Product ${data.name} processed successfully.`,
        variant: 'default',
      });
      queryClient.invalidateQueries({ queryKey: ['products'] }); // Invalidate product list cache
      setScanResult(null); // Clear result after processing
    },
    onError: (error: any) => {
      console.error('Error processing product:', error);
      toast({
        title: 'Error',
        description: `Failed to process product. ${error.message}`,
        variant: 'destructive',
      });
      setErrorMessage(`Failed to process product: ${error.message}`);
    },
  });

  const parseConsumptionRate = (
    rateString: string
  ): ProductData['consumptionRate'] | undefined => {
    const match = rateString.match(CONSUMPTION_RATE_REGEX);
    if (match) {
      const amount = parseInt(match[1], 10);
      const unit = match[3].toLowerCase() as 'day' | 'week' | 'month';
      if (!isNaN(amount) && ['day', 'week', 'month'].includes(unit)) {
        return { amount, unit };
      }
    }
    console.warn(`Could not parse consumption rate: "${rateString}"`);
    return undefined;
  };

  const parseQRCodeData = (decodedText: string): ProductData | null => {
    try {
      // Attempt to parse as JSON first
      const data = JSON.parse(decodedText);
      if (data.id && data.name && typeof data.quantity === 'number') {
        const product: ProductData = {
          id: String(data.id),
          name: String(data.name),
          quantity: data.quantity,
        };
        if (data.consumptionRate) {
          product.consumptionRate = parseConsumptionRate(data.consumptionRate);
        }
        return product;
      }
    } catch (e) {
      // If JSON parsing fails, try a simple delimited format (e.g., "ID:123,Name:Widget,Qty:50,Rate:5 per day")
      const parts = decodedText.split(',');
      const product: Partial<ProductData> & { id: string; name: string } = {
        id: '',
        name: '',
      }; // Required fields need defaults initially
      let foundId = false,
        foundName = false,
        foundQty = false;

      parts.forEach((part) => {
        const [key, value] = part.split(':');
        if (key && value) {
          const trimmedKey = key.trim().toLowerCase();
          const trimmedValue = value.trim();
          if (trimmedKey === 'id') {
            product.id = trimmedValue;
            foundId = true;
          } else if (trimmedKey === 'name') {
            product.name = trimmedValue;
            foundName = true;
          } else if (trimmedKey === 'qty' || trimmedKey === 'quantity') {
            const qty = parseInt(trimmedValue, 10);
            if (!isNaN(qty)) {
              product.quantity = qty;
              foundQty = true;
            }
          } else if (trimmedKey === 'rate' || trimmedKey === 'consumptionrate') {
            product.consumptionRate = parseConsumptionRate(trimmedValue);
          }
        }
      });

      if (foundId && foundName && foundQty) {
        return product as ProductData;
      }
    }

    console.error('Invalid QR code data format:', decodedText);
    setErrorMessage(
      'Invalid QR code format. Expected JSON or "Key:Value,..." format with id, name, and quantity.'
    );
    return null;
  };

  const onScanSuccess = (
    decodedText: string,
    decodedResult: Html5QrcodeResult
  ) => {
    console.log(`Code matched = ${decodedText}`, decodedResult);
    const parsedData = parseQRCodeData(decodedText);
    if (parsedData) {
      setScanResult(parsedData);
      setErrorMessage(null);
    }
    stopScan();
  };

  const onScanFailure = (error: QrcodeError | string) => {
    // Ignore "No QR code found" errors unless persistent
    if (typeof error === 'string' && error.includes('No QR code found')) {
      // console.debug(`Code scan error = ${error}`);
      return;
    }
    console.error(`Code scan error = ${error}`);
    setErrorMessage('QR code scanning failed. Please try again.');
    // Consider stopping scan on persistent errors
  };

  const startScan = async () => {
    setScanResult(null);
    setErrorMessage(null);

    try {
      // Check for camera permission (using navigator.mediaDevices)
      await navigator.mediaDevices.getUserMedia({ video: true });
      setHasPermission(true);

      const html5QrCode = new Html5Qrcode(QR_REGION_ID);
      scannerRef.current = html5QrCode;
      setIsScanning(true);

      html5QrCode
        .start(
          { facingMode: 'environment' }, // Prefer back camera
          {
            fps: 10, // Optional frame per seconds for qr code scanning
            qrbox: { width: 250, height: 250 }, // Optional bounding box UI
            aspectRatio: 1.0, // Optional aspect ratio for the video feed
          },
          onScanSuccess,
          onScanFailure
        )
        .catch((err) => {
          console.error('Error starting scanner:', err);
          setErrorMessage(
            `Could not start scanner: ${err.message}. Ensure camera access is allowed.`
          );
          setIsScanning(false);
          setHasPermission(false);
        });
    } catch (err: any) {
      console.error('Camera permission denied or error:', err);
      setErrorMessage(
        `Camera permission denied or error: ${err.message}. Please allow camera access in your browser settings.`
      );
      setHasPermission(false);
      setIsScanning(false);
    }
  };

  const stopScan = () => {
    if (scannerRef.current && isScanning) {
      scannerRef.current
        .stop()
        .then(() => {
          setIsScanning(false);
          scannerRef.current = null;
          console.log('QR Code scanning stopped.');
        })
        .catch((err) => {
          console.error('Error stopping the scanner:', err);
          // Even if stopping fails, update state
          setIsScanning(false);
          scannerRef.current = null;
        });
    } else {
      setIsScanning(false); // Ensure state is updated even if no scanner active
    }
  };

  // Cleanup scanner on component unmount
  useEffect(() => {
    return () => {
      stopScan();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleManualAdd = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const id = formData.get('productId') as string;
    const name = formData.get('productName') as string;
    const quantity = parseInt(formData.get('quantity') as string, 10);
    const consumptionRateStr = formData.get('consumptionRate') as string;

    if (!id || !name || isNaN(quantity)) {
        setErrorMessage("Please fill in Product ID, Name, and Quantity.");
        return;
    }

    const productData: ProductData = {
        id,
        name,
        quantity,
        consumptionRate: consumptionRateStr ? parseConsumptionRate(consumptionRateStr) : undefined,
    };

    setScanResult(productData); // Set result to trigger confirmation dialog
  };


  return (
    <Card className="w-full shadow-md">
      <CardHeader>
        <CardTitle className="text-center text-xl font-medium text-primary">
          Scan Product QR Code
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center space-y-6">
        <div id={QR_REGION_ID} className="w-full md:w-[400px] h-[300px] border border-dashed border-secondary rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-muted-foreground">
          {isScanning ? (
            <div className="animate-pulse">Scanning...</div>
          ) : (
             <div className="text-center">
                <ScanLine size={48} className="mx-auto mb-2" />
                Scanner Ready
            </div>
          )}
        </div>

        {hasPermission === false && (
          <p className="text-destructive text-center">
            <AlertTriangle className="inline mr-1" size={16} />
            Camera permission is required to scan QR codes. Please enable it in
            your browser settings.
          </p>
        )}

        {errorMessage && (
          <p className="text-destructive text-center">
            <AlertTriangle className="inline mr-1" size={16} />
            {errorMessage}
          </p>
        )}

        {!isScanning ? (
          <Button onClick={startScan} disabled={hasPermission === false}>
            <Camera className="mr-2 h-4 w-4" /> Start Scanning
          </Button>
        ) : (
          <Button onClick={stopScan} variant="outline">
            Stop Scanning
          </Button>
        )}

        <AlertDialog open={!!scanResult} onOpenChange={(open) => !open && setScanResult(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                <AlertDialogTitle>Confirm Product Details</AlertDialogTitle>
                <AlertDialogDescription>
                    Please confirm the details scanned or entered:
                    {scanResult && (
                    <ul className="mt-4 list-disc list-inside space-y-1 bg-muted p-3 rounded-md">
                        <li><strong>ID:</strong> {scanResult.id}</li>
                        <li><strong>Name:</strong> {scanResult.name}</li>
                        <li><strong>Quantity:</strong> {scanResult.quantity}</li>
                        {scanResult.consumptionRate && (
                        <li>
                            <strong>Consumption:</strong> {scanResult.consumptionRate.amount} per{' '}
                            {scanResult.consumptionRate.unit}
                        </li>
                        )}
                    </ul>
                    )}
                 </AlertDialogDescription>
                 {scanResult && scanResult.quantity < LOW_STOCK_THRESHOLD && (
                    <p className="text-accent font-semibold mt-2 flex items-center">
                        <AlertTriangle className="mr-2 h-5 w-5" /> Low Stock Warning!
                    </p>
                 )}
                </AlertDialogHeader>
                <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setScanResult(null)}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => mutation.mutate(scanResult!)} disabled={mutation.isPending}>
                    {mutation.isPending ? 'Processing...' : 'Confirm & Add/Update'}
                </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <div className="w-full border-t pt-6 mt-6">
             <h3 className="text-lg font-medium mb-4 text-center text-secondary">Or Add Manually</h3>
             <form onSubmit={handleManualAdd} className="space-y-4">
                <div>
                    <Label htmlFor="productId">Product ID</Label>
                    <Input id="productId" name="productId" required />
                </div>
                 <div>
                    <Label htmlFor="productName">Product Name</Label>
                    <Input id="productName" name="productName" required />
                </div>
                 <div>
                    <Label htmlFor="quantity">Quantity</Label>
                    <Input id="quantity" name="quantity" type="number" required />
                </div>
                <div>
                    <Label htmlFor="consumptionRate">Consumption Rate (e.g., "5 per day")</Label>
                    <Input id="consumptionRate" name="consumptionRate" placeholder="Optional (e.g., 10 / week)" />
                     <p className="text-xs text-muted-foreground mt-1">Format: [Number] per [day|week|month]</p>
                </div>
                 <Button type="submit" className="w-full">Add/Update Manually</Button>
             </form>
        </div>


      </CardContent>
    </Card>
  );
}
