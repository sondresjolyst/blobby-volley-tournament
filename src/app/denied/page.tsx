import { AuthLayout } from '@/components/auth/AuthLayout';

export default function Denied() {
    return (
        <AuthLayout>
            <p>This account does not have access to this page.</p>
        </AuthLayout>
    );
}
