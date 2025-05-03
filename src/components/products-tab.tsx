'use client';

import { useQuery } from '@tanstack/react-query';
import { getProducts, type Product } from '@/lib/firebase/firestore';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, PackageSearch } from 'lucide-react';

const LOW_STOCK_THRESHOLD = 10; // Consistent threshold

export function ProductsTab() {
  const { data: products, isLoading, error, refetch } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: getProducts,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchInterval: 60 * 1000 // Refetch every minute to keep data fresh-ish
  });

  const formatConsumptionRate = (rate: Product['consumptionRate']) => {
    if (!rate) return 'N/A';
    return `${rate.amount} / ${rate.unit}`;
  };

  return (
    <Card className="w-full shadow-md">
      <CardHeader>
        <CardTitle className="text-xl font-medium text-primary">
          Product Inventory
        </CardTitle>
        <CardDescription>
          Current stock levels and consumption rates. Quantities are updated automatically.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="space-y-4">
             {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center space-x-4 p-4 border rounded-md">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
                 <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        )}
        {error && (
          <div className="text-destructive text-center p-6 bg-destructive/10 rounded-md">
             <AlertTriangle className="mx-auto h-8 w-8 mb-2" />
            <p>Error loading products: {(error as Error).message}</p>
            <button onClick={() => refetch()} className="mt-4 text-sm underline">Try again</button>
          </div>
        )}
        {!isLoading && !error && products && products.length === 0 && (
           <div className="text-center p-10 text-muted-foreground">
              <PackageSearch className="mx-auto h-12 w-12 mb-4" />
              <p className="text-lg font-medium">No products found.</p>
              <p>Scan a QR code or add a product manually to get started.</p>
            </div>
        )}
        {!isLoading && !error && products && products.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead>Consumption Rate</TableHead>
                 <TableHead>Last Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell className="text-right">
                    {product.quantity < LOW_STOCK_THRESHOLD ? (
                       <Badge variant="destructive">{product.quantity}</Badge>
                    ) : (
                       <Badge variant="secondary">{product.quantity}</Badge>
                    )}
                  </TableCell>
                  <TableCell>{formatConsumptionRate(product.consumptionRate)}</TableCell>
                   <TableCell className="text-muted-foreground text-xs">
                     {product.lastUpdated ? new Date(product.lastUpdated.seconds * 1000).toLocaleString() : 'N/A'}
                   </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
