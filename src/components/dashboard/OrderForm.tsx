import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Order } from '@/types/order';
import { useUpsertOrder } from '@/hooks/useOrders';

const formSchema = z.object({
    receipt_no: z.string().min(1, 'Receipt No is required'),
    name: z.string().min(1, 'Name is required'),
    number: z.string().min(10, 'Valid number required'),
    secondary_number: z.string().optional(),
    customer_address: z.string().optional(),
    payment_mode: z.string().optional(),
    scheme: z.string().min(1, 'Scheme is required'),
    value: z.coerce.number().min(0),
    type: z.string().min(1, 'Type is required'),
    district: z.string().min(1, 'District is required'),
    current_month: z.string().regex(/^\d{4}-\d{2}$/, 'Format must be YYYY-MM'),
});

interface OrderFormProps {
    order?: Order;
    onSuccess?: () => void;
}

export function OrderForm({ order, onSuccess }: OrderFormProps) {
    const upsertOrder = useUpsertOrder();

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            receipt_no: order?.receipt_no || '',
            name: order?.name || '',
            number: order?.number || '',
            secondary_number: order?.secondary_number || '',
            customer_address: order?.customer_address || '',
            payment_mode: order?.payment_mode || 'Gpay',
            scheme: order?.scheme || '',
            value: order?.value || 0,
            type: order?.type || '10 Months',
            district: order?.district || '',
            current_month: order?.current_month || new Date().toISOString().slice(0, 7),
        },
    });

    function onSubmit(values: z.infer<typeof formSchema>) {
        upsertOrder.mutate(
            { ...values, id: order?.id },
            {
                onSuccess: () => {
                    onSuccess?.();
                },
            }
        );
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="receipt_no"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Receipt No</FormLabel>
                                <FormControl>
                                    <Input placeholder="R-123" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="current_month"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Month (YYYY-MM)</FormLabel>
                                <FormControl>
                                    <Input placeholder="2024-05" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Customer Name</FormLabel>
                            <FormControl>
                                <Input placeholder="John Doe" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="customer_address"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Customer Address</FormLabel>
                            <FormControl>
                                <Textarea
                                    placeholder="Enter full address here..."
                                    className="resize-none h-20"
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="number"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Primary Number</FormLabel>
                                <FormControl>
                                    <Input placeholder="9876543210" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="secondary_number"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Secondary Number</FormLabel>
                                <FormControl>
                                    <Input placeholder="Optional" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="scheme"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Scheme</FormLabel>
                                <FormControl>
                                    <Input placeholder="Business Star" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="value"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Value (₹)</FormLabel>
                                <FormControl>
                                    <Input type="number" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="type"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Type</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select type" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="10 Months">10 Months</SelectItem>
                                        <SelectItem value="12 Months">12 Months</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="payment_mode"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Payment Mode</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select mode" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="Gpay">Gpay</SelectItem>
                                        <SelectItem value="Phone pay">Phone pay</SelectItem>
                                        <SelectItem value="Paytm">Paytm</SelectItem>
                                        <SelectItem value="cash">cash</SelectItem>
                                        <SelectItem value="bank transfer">bank transfer</SelectItem>
                                        <SelectItem value="card">card</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <FormField
                    control={form.control}
                    name="district"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>District</FormLabel>
                            <FormControl>
                                <Input placeholder="Mumbai" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <Button type="submit" className="w-full btn-premium shadow-md shadow-primary/20" disabled={upsertOrder.isPending}>
                    {order?.id ? 'Update Record' : 'Add Record'}
                </Button>
            </form>
        </Form>
    );
}
