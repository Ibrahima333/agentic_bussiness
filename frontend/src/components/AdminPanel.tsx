import React, { useEffect, useState } from "react";
import { UserPlus, Trash2, PowerOff, Power, RefreshCw } from "lucide-react";
import { apiFetch } from "../lib/api";

interface User {
  id:         number;
  email:      string;
  role:       "admin" | "user";
  is_active:  number;
  created_at: string;
}

export function AdminPanel() {
  const [users, setUsers]       = useState<User[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Formulaire création
  const [newEmail, setNewEmail]       = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole]         = useState<"user" | "admin">("user");
  const [creating, setCreating]       = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("/api/auth/users");
      setUsers(data.users);
    } catch (e: any) {
      setError(e.message ?? "Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadUsers(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      await apiFetch("/api/auth/users", {
        method: "POST",
        body: JSON.stringify({ email: newEmail, password: newPassword, role: newRole }),
      });
      setNewEmail(""); setNewPassword(""); setNewRole("user");
      setShowForm(false);
      await loadUsers();
    } catch (e: any) {
      setCreateError(e.message ?? "Erreur");
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(user: User) {
    await apiFetch(`/api/auth/users/${user.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: user.is_active ? 0 : 1 }),
    });
    await loadUsers();
  }

  async function handleDelete(user: User) {
    if (!confirm(`Supprimer définitivement ${user.email} ?`)) return;
    await apiFetch(`/api/auth/users/${user.id}`, { method: "DELETE" });
    await loadUsers();
  }

  return (
    <div className="flex-1 overflow-auto p-6 bg-slate-50">
      <div className="max-w-3xl mx-auto">

        {/* En-tête */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Gestion des utilisateurs</h1>
            <p className="text-sm text-slate-500 mt-0.5">{users.length} compte{users.length > 1 ? "s" : ""}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void loadUsers()}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-colors"
              title="Rafraîchir"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Nouvel utilisateur
            </button>
          </div>
        </div>

        {/* Formulaire création */}
        {showForm && (
          <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-xl p-4 mb-4 space-y-3">
            <h2 className="font-semibold text-slate-800 text-sm">Créer un compte</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-slate-500 mb-1">Email</label>
                <input
                  type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                  required placeholder="prenom.nom@entreprise.com"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Mot de passe</label>
                <input
                  type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  required minLength={6} placeholder="6 caractères minimum"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Rôle</label>
                <select
                  value={newRole} onChange={e => setNewRole(e.target.value as "user" | "admin")}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="user">Utilisateur</option>
                  <option value="admin">Administrateur</option>
                </select>
              </div>
            </div>
            {createError && (
              <p className="text-red-600 text-sm">{createError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowForm(false)}
                className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900">
                Annuler
              </button>
              <button type="submit" disabled={creating}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg">
                {creating ? "Création…" : "Créer"}
              </button>
            </div>
          </form>
        )}

        {/* Erreur chargement */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm mb-4">{error}</div>
        )}

        {/* Liste des users */}
        {loading ? (
          <div className="text-center py-12 text-slate-400 text-sm">Chargement…</div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Rôle</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Statut</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Créé le</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map(user => (
                  <tr key={user.id} className={`${!user.is_active ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3 font-medium text-slate-800">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        user.role === "admin"
                          ? "bg-violet-100 text-violet-700"
                          : "bg-slate-100 text-slate-600"
                      }`}>
                        {user.role === "admin" ? "Admin" : "Utilisateur"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        user.is_active
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}>
                        {user.is_active ? "Actif" : "Désactivé"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{user.created_at?.slice(0, 10)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => void toggleActive(user)}
                          className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                          title={user.is_active ? "Désactiver" : "Réactiver"}
                        >
                          {user.is_active ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => void handleDelete(user)}
                          className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
