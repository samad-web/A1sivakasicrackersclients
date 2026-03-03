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
import { Order } from '@/types/order';
import { useUpsertOrder } from '@/hooks/useOrders';

const formSchema = z.object({
    receipt_no: z.string().min(1, 'Receipt No is required'),
    name: z.string().min(1, 'Name is required'),
    number: z.string().min(10, 'Valid number required'),
    secondary_number: z.string().optional(),
    address_line1: z.string().min(1, 'Address Line 1 is required'),
    address_line2: z.string().optional(),
    city: z.string().min(1, 'City is required'),
    pincode: z.string().min(6, 'Valid Pincode required'),
    state: z.string().min(1, 'State is required'),
    payment_mode: z.string().optional(),
    scheme: z.string().min(1, 'Scheme is required'),
    value: z.coerce.number().min(0),
    type: z.string().min(1, 'Type is required'),
    district: z.string().min(1, 'District is required'),
});

interface OrderFormProps {
    order?: Order;
    onSuccess?: () => void;
    currentMonth?: string;
}

export function OrderForm({ order, onSuccess, currentMonth }: OrderFormProps) {
    const upsertOrder = useUpsertOrder();

    const parseAddress = (fullAddress: string | null | undefined) => {
        if (!fullAddress) return {
            address_line1: '',
            address_line2: '',
            city: '',
            pincode: '',
            state: 'Tamil Nadu'
        };

        return {
            address_line1: fullAddress,
            address_line2: '',
            city: '',
            pincode: '',
            state: 'Tamil Nadu'
        };
    };

    const addressDefaults = parseAddress(order?.customer_address);

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            receipt_no: order?.receipt_no || '',
            name: order?.name || '',
            number: order?.number || '',
            secondary_number: order?.secondary_number || '',
            address_line1: addressDefaults.address_line1,
            address_line2: addressDefaults.address_line2,
            city: addressDefaults.city,
            pincode: addressDefaults.pincode,
            state: addressDefaults.state,
            payment_mode: order?.payment_mode || 'Gpay',
            scheme: order?.scheme || '',
            value: order?.value || 0,
            type: order?.type || '10 Months',
            district: order?.district || '',
        },
    });

    function onSubmit(values: z.infer<typeof formSchema>) {
        const fullAddress = [
            values.address_line1,
            values.address_line2,
            values.city,
            values.state,
            values.pincode ? `Pin - ${values.pincode}` : ''
        ].filter(Boolean).join(', ');

        const payload = {
            ...values,
            customer_address: fullAddress,
            current_month: order?.current_month || currentMonth,
        } as Partial<Order>;

        if (order?.id) {
            payload.id = order.id;
        }

        upsertOrder.mutate(
            payload,
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                </div>

                <div className="space-y-3 bg-muted/30 p-4 rounded-lg border">
                    <h3 className="text-sm font-semibold text-foreground/80">Address Details</h3>
                    <FormField
                        control={form.control}
                        name="address_line1"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-xs">Address Line 1</FormLabel>
                                <FormControl>
                                    <Input placeholder="Door No, Street Name" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="address_line2"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-xs">Address Line 2 (Optional)</FormLabel>
                                <FormControl>
                                    <Input placeholder="Area, Landmark" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <FormField
                            control={form.control}
                            name="city"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs">City/Town</FormLabel>
                                    <FormControl>
                                        <Input placeholder="City" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="state"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs">State</FormLabel>
                                    <FormControl>
                                        <Input placeholder="State" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="pincode"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs">Pincode</FormLabel>
                                    <FormControl>
                                        <Input placeholder="600001" {...field} maxLength={6} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                <Button type="submit" className="w-full btn-premium shadow-md shadow-primary/20 mt-6" disabled={upsertOrder.isPending}>
                    {order?.id ? 'Update Record' : 'Add Record'}
                </Button>
            </form>
        </Form>
    );
}
