import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import JoinStepper from '@/components/navigation/JoinStepper';
import { FileSignature, Hash, ShieldCheck, ClipboardList } from 'lucide-react';
import gulfCryoLogo from '@/assets/gulf-cryo-logo.png';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        toast({
          title: 'Account created',
          description: 'Your account is pending admin approval. You\'ll be able to sign in once approved.',
        });
        await supabase.auth.signOut();
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate('/');
      }
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Authentication failed',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleMicrosoftSignIn = async () => {
    setSsoLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'azure',
        options: {
          scopes: 'email openid profile offline_access',
          redirectTo: `${window.location.origin}/`,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      toast({
        title: 'Microsoft sign-in failed',
        description:
          err?.message ??
          'Unable to start Microsoft sign-in. The Azure provider may not be configured yet — see the setup steps in chat.',
        variant: 'destructive',
      });
      setSsoLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast({ title: 'Enter your email', description: 'Type the email above first, then click Forgot password.', variant: 'destructive' });
      return;
    }
    setResetting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast({ title: 'Check your email', description: 'If an account exists for this address, a reset link has been sent.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message ?? 'Failed to send reset email', variant: 'destructive' });
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2 bg-background">
      {/* ── Brand pane ─────────────────────────────────────────── */}
      <aside className="relative hidden overflow-hidden bg-[image:var(--gradient-primary)] p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-80 w-80 rounded-full bg-white/5 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white p-2 shadow-elegant ring-1 ring-white/30">
            <img src={gulfCryoLogo} alt="Gulf Cryo" className="h-full w-full object-contain" />
          </div>
          <div className="leading-tight">
            <p className="text-xs uppercase tracking-[0.18em] text-primary-foreground/70">Gulf Cryo</p>
            <p className="text-lg font-semibold">Letterhead Manager</p>
          </div>
        </div>

        <div className="relative space-y-8">
          <div className="space-y-3">
            <h2 className="text-4xl font-bold leading-tight tracking-tight">
              Branded letterheads.<br />Without the friction.
            </h2>
            <p className="max-w-md text-base text-primary-foreground/80">
              Generate, number, and audit every official document — on the company letterhead, every time.
            </p>
          </div>

          <ul className="space-y-4">
            {[
              { icon: FileSignature, title: 'Branded letterheads', body: 'Apply the official Gulf Cryo template to any PDF, Word, or image upload.' },
              { icon: Hash, title: 'Automatic serial numbers', body: 'Every generated document gets a unique, traceable reference.' },
              { icon: ShieldCheck, title: 'Admin approval workflow', body: 'New users join securely — access is granted by your admin team.' },
              { icon: ClipboardList, title: 'Full audit trail', body: 'Every upload, download, and change is logged for compliance.' },
            ].map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-inset ring-white/25 backdrop-blur">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="leading-snug">
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="text-sm text-primary-foreground/75">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-primary-foreground/60">
          © {new Date().getFullYear()} Gulf Cryo · Document Management System
        </p>
      </aside>

      {/* ── Auth pane ──────────────────────────────────────────── */}
      <main className="flex flex-col items-center justify-center gap-6 p-6 sm:p-10">
        <div className="w-full max-w-md">
          <JoinStepper current="sign-in" />
        </div>
        <Card className="w-full max-w-md shadow-elegant">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-white p-2 ring-1 ring-border lg:hidden">
              <img src={gulfCryoLogo} alt="Gulf Cryo" className="h-full w-full object-contain" />
            </div>
            <CardTitle className="text-2xl">{isSignUp ? 'Create your account' : 'Welcome back'}</CardTitle>
            <CardDescription>
              {isSignUp
                ? 'It takes about a minute. After sign-up, an admin will quickly approve you.'
                : 'Sign in to the Gulf Cryo Document Management System.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={isSignUp ? 'signup' : 'signin'} onValueChange={(v) => setIsSignUp(v === 'signup')} className="mb-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Create account</TabsTrigger>
              </TabsList>
            </Tabs>

          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            onClick={handleMicrosoftSignIn}
            disabled={ssoLoading || loading}
          >
            <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden="true">
              <rect x="1" y="1" width="9" height="9" fill="#F25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
              <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
              <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
            </svg>
            {ssoLoading ? 'Redirecting…' : 'Sign in with Microsoft'}
          </Button>

          <div className="my-4 flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">or with email</span>
            <Separator className="flex-1" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Enter your full name"
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@gulfcryo.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || ssoLoading}>
              {loading ? 'Please wait...' : isSignUp ? 'Sign Up' : 'Sign In'}
            </Button>
            {!isSignUp && (
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={resetting}
                className="block w-full text-center text-xs text-muted-foreground hover:text-primary underline"
              >
                {resetting ? 'Sending…' : 'Forgot password?'}
              </button>
            )}
          </form>
          <div className="mt-4 text-center text-sm text-muted-foreground">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              className="text-primary underline"
              onClick={() => setIsSignUp(!isSignUp)}
            >
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </button>
          </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
