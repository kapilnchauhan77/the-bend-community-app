import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Building2, Users, FileText, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Navbar } from '@/components/layout/Navbar';
import api from '@/services/api';
import type { TenantAdmin } from '@/types';

const PRIMARY = 'hsl(160, 25%, 24%)';
const BRONZE = 'hsl(35, 45%, 42%)';

export default function TenantsListPage() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<TenantAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    slug: '',
    subdomain: '',
    display_name: '',
    tagline: '',
    primary_color: 'hsl(160,25%,24%)',
  });

  useEffect(() => {
    loadTenants();
  }, []);

  const loadTenants = () => {
    api
      .get('/super-admin/tenants')
      .then((res) => setTenants(res.data.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const subdomain = form.subdomain || `${form.slug}.thebend.app`;
      await api.post('/super-admin/tenants', { ...form, subdomain });
      setShowCreate(false);
      setForm({ slug: '', subdomain: '', display_name: '', tagline: '', primary_color: 'hsl(160,25%,24%)' });
      loadTenants();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to create tenant');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold font-serif" style={{ color: PRIMARY }}>
              Super Admin
            </h1>
            <p className="text-sm text-gray-500 mt-1">Manage all community tenants</p>
          </div>
          <Button
            onClick={() => setShowCreate(!showCreate)}
            className="text-white text-xs tracking-wider uppercase"
            style={{ backgroundColor: BRONZE }}
          >
            <Plus className="w-4 h-4 mr-2" />
            New Tenant
          </Button>
        </div>

        {showCreate && (
          <form onSubmit={handleCreate} className="bg-white border border-gray-200 p-6 mb-8 space-y-4">
            <h2 className="text-lg font-semibold font-serif" style={{ color: PRIMARY }}>Create New Tenant</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Slug (URL-safe)</Label>
                <Input
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                  placeholder="king-george"
                  required
                />
              </div>
              <div>
                <Label>Subdomain</Label>
                <Input
                  value={form.subdomain}
                  onChange={(e) => setForm({ ...form, subdomain: e.target.value })}
                  placeholder="king-george.thebend.app"
                />
              </div>
              <div>
                <Label>Display Name</Label>
                <Input
                  value={form.display_name}
                  onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                  placeholder="The Bend — King George"
                  required
                />
              </div>
              <div>
                <Label>Tagline</Label>
                <Input
                  value={form.tagline}
                  onChange={(e) => setForm({ ...form, tagline: e.target.value })}
                  placeholder="Find opportunity within your neighborhood"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={creating} className="text-white" style={{ backgroundColor: BRONZE }}>
                {creating ? 'Creating...' : 'Create Tenant'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-gray-100 animate-pulse rounded" />
            ))}
          </div>
        ) : tenants.length === 0 ? (
          <div className="text-center py-16 bg-white border border-dashed border-gray-300">
            <Building2 className="w-10 h-10 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No tenants yet. Create your first one above.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tenants.map((tenant) => (
              <div
                key={tenant.id}
                onClick={() => navigate(`/super-admin/tenants/${tenant.id}`)}
                className="bg-white border border-gray-200 p-5 flex items-center justify-between cursor-pointer hover:border-gray-400 transition-colors group"
              >
                <div className="flex items-center gap-4">
                  <div
                    className="w-10 h-10 rounded flex items-center justify-center text-white font-bold font-serif text-sm"
                    style={{ backgroundColor: tenant.primary_color || PRIMARY }}
                  >
                    {tenant.slug[0].toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{tenant.display_name}</h3>
                    <p className="text-xs text-gray-500">{tenant.subdomain}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    className={`text-xs ${tenant.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                  >
                    {tenant.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                  <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
