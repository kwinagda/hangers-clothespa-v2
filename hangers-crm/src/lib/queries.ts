// ─────────────────────────────────────────────────────────────────────────────
// REACT QUERY HOOKS — typed, cached data fetching for CRM pages.
//
// Import these hooks in page/component files instead of calling *API directly.
// They handle loading state, error state, caching, and background refresh.
//
// Example:
//   const { data, isPending, error } = useOrders({ status: 'PENDING' });
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ordersAPI,
  customersAPI,
  staffAPI,
  servicesAPI,
  paymentsAPI,
} from './api';

// ── Query key factory — keeps all keys in one place for easy invalidation ─────
export const queryKeys = {
  orders:    (filters?: Record<string, unknown>) => ['orders', filters] as const,
  order:     (id: string)                         => ['order', id]      as const,
  customers: (q?: string)                         => ['customers', q]   as const,
  customer:  (id: string)                         => ['customer', id]   as const,
  staff:     ()                                   => ['staff']          as const,
  services:  ()                                   => ['services']       as const,
  payments:  (orderId: string)                    => ['payments', orderId] as const,
};

// ── Orders ────────────────────────────────────────────────────────────────────

export function useOrders(filters?: Record<string, unknown>) {
  return useQuery({
    queryKey:        queryKeys.orders(filters),
    queryFn:         () => ordersAPI.list(filters),
    staleTime:       30_000,
    refetchInterval: 60_000,
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: queryKeys.order(id),
    queryFn:  () => ordersAPI.get(id),
    enabled:  !!id,
  });
}

type UpdateStatusVars = { id: string; status: string; notes?: string };

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, UpdateStatusVars>({
    mutationFn: ({ id, status, notes }) => ordersAPI.updateStatus(id, status, notes),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.order(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders() });
    },
  });
}

// ── Customers ─────────────────────────────────────────────────────────────────

export function useCustomers(query?: string) {
  return useQuery({
    queryKey:  queryKeys.customers(query),
    queryFn:   () => customersAPI.list({ search: query }),
    staleTime: 60_000,
  });
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: queryKeys.customer(id),
    queryFn:  () => customersAPI.get(id),
    enabled:  !!id,
  });
}

// ── Staff ─────────────────────────────────────────────────────────────────────

export function useStaff() {
  return useQuery({
    queryKey:  queryKeys.staff(),
    queryFn:   () => staffAPI.list(),
    staleTime: 5 * 60_000,
  });
}

// ── Services / Pricing ────────────────────────────────────────────────────────

export function useServices() {
  return useQuery({
    queryKey:  queryKeys.services(),
    queryFn:   () => servicesAPI.getPriceList(),
    staleTime: 15 * 60_000,
  });
}

// ── Payments ──────────────────────────────────────────────────────────────────

export function useOrderPayments(orderId: string) {
  return useQuery({
    queryKey: queryKeys.payments(orderId),
    queryFn:  () => paymentsAPI.byOrder(orderId),
    enabled:  !!orderId,
  });
}

type RecordPaymentVars = { orderId: string; amount: number; method: string; reference?: string; notes?: string };

export function useRecordPayment() {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, RecordPaymentVars>({
    mutationFn: (payload) => paymentsAPI.record(payload),
    onSuccess: (_data, { orderId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payments(orderId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.order(orderId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders() });
    },
  });
}
