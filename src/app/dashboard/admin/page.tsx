"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalFooter,
} from "@/components/ui/modal";
import { PageIntro } from "@/components/layout/page-intro";
import { SubNav } from "@/components/layout/sub-nav";
import { SUB_NAV } from "@/components/layout/nav-config";
import { Users, Plus, Pencil, Trash2, Shield, Mail, Send, Check, Clock, Copy } from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

interface Invite {
  id: string;
  email: string;
  token: string;
  used: boolean;
  expiresAt: string;
  createdAt: string;
  usedAt: string | null;
}

const ROLE_OPTIONS = [
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
];

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Form state
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState("user");

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Invite state
  const [inviteList, setInviteList] = useState<Invite[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [copiedUrl, setCopiedUrl] = useState("");

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (res.status === 403) {
        setError("You do not have permission to access this page");
        return;
      }
      if (!res.ok) {
        setError("Failed to load users");
        return;
      }
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch {
      setError("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadInvites = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/invites");
      if (res.ok) {
        const data = await res.json();
        setInviteList(data.invites ?? []);
      }
    } catch { /* ignore — invites are secondary */ }
  }, []);

  useEffect(() => {
    loadUsers();
    loadInvites();
  }, [loadUsers, loadInvites]);

  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteSending(true);
    setInviteError("");
    setInviteSuccess("");

    try {
      const res = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInviteError(data.error ?? "Failed to send invite");
        return;
      }

      setInviteSuccess(data.emailSent ? `Invite sent to ${inviteEmail}` : `Invite created — email not configured. Link: ${data.signupUrl}`);
      setInviteEmail("");
      loadInvites();
      setTimeout(() => setInviteSuccess(""), 8000);
    } catch {
      setInviteError("Failed to send invite");
    } finally {
      setInviteSending(false);
    }
  }

  function copySignupUrl(invite: Invite) {
    const appUrl = window.location.origin;
    const url = `${appUrl}/register?token=${invite.token}`;
    navigator.clipboard.writeText(url);
    setCopiedUrl(invite.id);
    setTimeout(() => setCopiedUrl(""), 2000);
  }

  function openAddModal() {
    setEditingUser(null);
    setFormName("");
    setFormEmail("");
    setFormPassword("");
    setFormRole("user");
    setModalError("");
    setFieldErrors({});
    setModalOpen(true);
  }

  function openEditModal(user: User) {
    setEditingUser(user);
    setFormName(user.name);
    setFormEmail(user.email);
    setFormPassword("");
    setFormRole(user.role);
    setModalError("");
    setFieldErrors({});
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingUser(null);
    setModalError("");
    setFieldErrors({});
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setModalError("");
    setFieldErrors({});

    try {
      if (editingUser) {
        // Update
        const body: Record<string, string> = { id: editingUser.id };
        if (formName !== editingUser.name) body.name = formName;
        if (formEmail !== editingUser.email) body.email = formEmail;
        if (formRole !== editingUser.role) body.role = formRole;
        if (formPassword) body.password = formPassword;

        const res = await fetch("/api/admin/users", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Update failed" }));
          if (data.fieldErrors) setFieldErrors(data.fieldErrors);
          setModalError(data.error ?? "Update failed");
          return;
        }

        const data = await res.json();
        setUsers((prev) =>
          prev.map((u) => (u.id === editingUser.id ? data.user : u))
        );
      } else {
        // Create
        const res = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formName,
            email: formEmail,
            password: formPassword,
            role: formRole,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Create failed" }));
          if (data.fieldErrors) setFieldErrors(data.fieldErrors);
          setModalError(data.error ?? "Create failed");
          return;
        }

        const data = await res.json();
        setUsers((prev) => [...prev, data.user]);
      }

      closeModal();
    } catch {
      setModalError("Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Delete failed" }));
        setError(data.error ?? "Delete failed");
        return;
      }

      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch {
      setError("Delete failed");
    } finally {
      setDeleting(false);
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="p-4 lg:p-6">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error && users.length === 0) {
    return (
      <div className="p-4 lg:p-6">
        <SubNav tabs={SUB_NAV.admin} />
        <div className="flex flex-col items-center justify-center py-20">
          <Shield className="w-10 h-10 text-text-muted mb-3" />
          <p className="text-sm text-bearish">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <SubNav tabs={SUB_NAV.admin} />

      <PageIntro
        eyebrow="Administration"
        title="User Management"
        description="Create and manage user accounts."
        actions={
          <Button onClick={openAddModal}>
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add</span> User
          </Button>
        }
        stats={[
          { label: "Total Users", value: users.length },
          {
            label: "Admins",
            value: users.filter((u) => u.role === "admin").length,
            tone: "brand",
          },
        ]}
      />

      {error && <p className="text-sm text-bearish">{error}</p>}

      <Card>
        {users.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-10 h-10 text-text-muted mx-auto mb-3" />
            <p className="text-sm text-text-muted mb-1">No users found</p>
            <p className="text-xs text-text-muted">
              Create a user to get started
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-muted text-left">
                  <th className="pb-3 pr-4 font-medium">Name</th>
                  <th className="pb-3 pr-4 font-medium">Email</th>
                  <th className="pb-3 pr-4 font-medium">Role</th>
                  <th className="pb-3 pr-4 font-medium">Created</th>
                  <th className="pb-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-border/50 hover:bg-bg-elevated/50 transition-colors"
                  >
                    <td className="py-3 pr-4">
                      <span className="font-medium text-text-primary">
                        {user.name}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-text-secondary">
                      {user.email}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge
                        variant={user.role === "admin" ? "accent" : "neutral"}
                      >
                        {user.role === "admin" && (
                          <Shield className="w-3 h-3 mr-1" />
                        )}
                        {user.role}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4 font-mono text-text-secondary text-xs">
                      {new Date(user.createdAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditModal(user)}
                          aria-label={`Edit ${user.name}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingId(user.id)}
                          className="text-bearish hover:text-bearish"
                          aria-label={`Delete ${user.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Invites Section ── */}
      <div className="pt-4">
        <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Mail className="w-5 h-5 text-accent" />
          Invitations
        </h2>

        {/* Send invite form */}
        <Card>
          <form onSubmit={handleSendInvite} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Input
                label="Invite by email"
                type="email"
                placeholder="user@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
            </div>
            <Button type="submit" loading={inviteSending} className="min-h-[44px]">
              <Send className="w-4 h-4" />
              Send Invite
            </Button>
          </form>

          {inviteError && (
            <p className="mt-3 text-sm text-bearish">{inviteError}</p>
          )}
          {inviteSuccess && (
            <p className="mt-3 text-sm text-bullish">{inviteSuccess}</p>
          )}
        </Card>
      </div>

      {/* Invite list */}
      {inviteList.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-muted text-left">
                  <th className="pb-3 pr-4 font-medium">Email</th>
                  <th className="pb-3 pr-4 font-medium">Status</th>
                  <th className="pb-3 pr-4 font-medium">Sent</th>
                  <th className="pb-3 pr-4 font-medium">Expires</th>
                  <th className="pb-3 font-medium text-right">Link</th>
                </tr>
              </thead>
              <tbody>
                {inviteList.map((inv) => {
                  const expired = !inv.used && new Date(inv.expiresAt) < new Date();
                  return (
                    <tr key={inv.id} className="border-b border-border/50 hover:bg-bg-elevated/50 transition-colors">
                      <td className="py-3 pr-4 text-text-primary">{inv.email}</td>
                      <td className="py-3 pr-4">
                        {inv.used ? (
                          <Badge variant="bullish"><Check className="w-3 h-3 mr-1" />Registered</Badge>
                        ) : expired ? (
                          <Badge variant="warning"><Clock className="w-3 h-3 mr-1" />Expired</Badge>
                        ) : (
                          <Badge variant="neutral"><Clock className="w-3 h-3 mr-1" />Pending</Badge>
                        )}
                      </td>
                      <td className="py-3 pr-4 font-mono text-text-secondary text-xs">
                        {new Date(inv.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </td>
                      <td className="py-3 pr-4 font-mono text-text-secondary text-xs">
                        {new Date(inv.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </td>
                      <td className="py-3 text-right">
                        {!inv.used && !expired && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copySignupUrl(inv)}
                            aria-label="Copy invite link"
                          >
                            {copiedUrl === inv.id ? (
                              <><Check className="w-3.5 h-3.5 text-bullish" /> <span className="text-xs text-bullish">Copied</span></>
                            ) : (
                              <><Copy className="w-3.5 h-3.5" /> <span className="text-xs">Copy</span></>
                            )}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Add / Edit User Modal */}
      <Modal open={modalOpen} onClose={closeModal}>
        <ModalHeader>
          <ModalTitle>
            {editingUser ? "Edit User" : "Add User"}
          </ModalTitle>
        </ModalHeader>

        <form onSubmit={handleSave} className="space-y-4">
          <Input
            label="Name"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="Full name"
            error={fieldErrors.name}
            required
          />
          <Input
            label="Email"
            type="email"
            value={formEmail}
            onChange={(e) => setFormEmail(e.target.value)}
            placeholder="user@example.com"
            error={fieldErrors.email}
            required
          />
          <Input
            label={editingUser ? "Password (leave blank to keep current)" : "Password"}
            type="password"
            value={formPassword}
            onChange={(e) => setFormPassword(e.target.value)}
            placeholder={editingUser ? "Unchanged" : "Min 8 chars, letters + numbers"}
            error={fieldErrors.password}
            required={!editingUser}
          />
          <Select
            label="Role"
            options={ROLE_OPTIONS}
            value={formRole}
            onChange={setFormRole}
          />

          {modalError && (
            <p className="text-sm text-bearish">{modalError}</p>
          )}

          <ModalFooter>
            <Button type="button" variant="ghost" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editingUser ? "Save Changes" : "Create User"}
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deletingId !== null}
        onClose={() => setDeletingId(null)}
      >
        <ModalHeader>
          <ModalTitle>Delete User</ModalTitle>
        </ModalHeader>
        <p className="text-sm text-text-secondary">
          Are you sure you want to delete this user? This action cannot be
          undone.
        </p>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setDeletingId(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={deleting}
            onClick={() => deletingId && handleDelete(deletingId)}
          >
            Delete User
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
