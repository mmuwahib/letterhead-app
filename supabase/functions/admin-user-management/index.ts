import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = claimsData.claims.sub;

    // Check admin role
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    if (action === "list-users") {
      const emails: Record<string, string> = {};
      let page = 1;
      const perPage = 1000;
      // Page through auth users (Supabase admin API caps at 1000/page)
      // Most projects have well under 5k users; cap at 10 pages defensively.
      for (let i = 0; i < 10; i++) {
        const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        for (const u of data?.users ?? []) {
          if (u.email) emails[u.id] = u.email;
        }
        if (!data?.users || data.users.length < perPage) break;
        page += 1;
      }
      return new Response(JSON.stringify({ emails }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update-user") {
      const { userId, fullName, email, onboarded } = body;
      if (!userId) {
        return new Response(JSON.stringify({ error: "userId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (typeof email === "string" && email.length > 0) {
        // Only call auth admin if the email actually changed; otherwise gotrue
        // returns a generic "Error updating user".
        const { data: existing, error: getErr } = await adminClient.auth.admin.getUserById(userId);
        if (getErr) {
          console.error("getUserById failed:", getErr);
          return new Response(JSON.stringify({ error: getErr.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const currentEmail = existing?.user?.email ?? "";
        if (email.toLowerCase() !== currentEmail.toLowerCase()) {
          const { error: authErr } = await adminClient.auth.admin.updateUserById(userId, {
            email,
            email_confirm: true,
          });
          if (authErr) {
            console.error("updateUserById(email) failed:", authErr);
            return new Response(JSON.stringify({ error: authErr.message }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      }

      const profileUpdate: Record<string, unknown> = {};
      if (typeof fullName === "string") profileUpdate.full_name = fullName;
      if (typeof onboarded === "boolean") profileUpdate.onboarded = onboarded;

      if (Object.keys(profileUpdate).length > 0) {
        const { error: profErr } = await adminClient
          .from("profiles")
          .update(profileUpdate)
          .eq("user_id", userId);
        if (profErr) {
          return new Response(JSON.stringify({ error: profErr.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "invite-user") {
      const { email, fullName, redirectTo } = body;
      if (!email || typeof email !== "string") {
        return new Response(JSON.stringify({ error: "email is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
        data: fullName ? { full_name: fullName } : undefined,
        redirectTo: typeof redirectTo === "string" && redirectTo.length > 0 ? redirectTo : undefined,
      });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Auto-approve invited users so they can sign in immediately after accepting.
      if (data?.user?.id) {
        await adminClient
          .from("profiles")
          .update({ approved_at: new Date().toISOString() })
          .eq("user_id", data.user.id);
      }

      return new Response(JSON.stringify({ success: true, userId: data?.user?.id ?? null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create-user") {
      const { email, password, fullName, role, legalEntityId, officeSiteId, departmentId } = body;
      if (!email || !password) {
        return new Response(JSON.stringify({ error: "email and password are required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (typeof password !== "string" || password.length < 6) {
        return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const allowedRoles = ["admin", "manager", "user"];
      const finalRole = allowedRoles.includes(role) ? role : "user";

      // Pre-check duplicate full name (case-insensitive)
      if (fullName && fullName.trim()) {
        const { data: dupName } = await adminClient
          .from("profiles")
          .select("user_id")
          .ilike("full_name", fullName.trim())
          .maybeSingle();
        if (dupName) {
          return new Response(JSON.stringify({ error: "A user with this name already exists" }), {
            status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      let newUserId: string | null = null;
      const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: fullName ? { full_name: fullName } : undefined,
      });
      if (createErr) {
        // If a user with this email already exists (e.g. from a previous failed
        // attempt that left an orphan auth user), recover by updating the
        // existing auth user's password and reusing their id.
        const msg = (createErr.message ?? "").toLowerCase();
        const alreadyExists = msg.includes("already") || msg.includes("registered");
        if (!alreadyExists) {
          return new Response(JSON.stringify({ error: createErr.message }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        // Find the existing auth user by paging
        let foundId: string | null = null;
        for (let page = 1; page <= 10 && !foundId; page++) {
          const { data: list } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
          for (const u of list?.users ?? []) {
            if (u.email?.toLowerCase() === email.toLowerCase()) { foundId = u.id; break; }
          }
          if (!list?.users || list.users.length < 1000) break;
        }
        if (!foundId) {
          return new Response(JSON.stringify({ error: "Email exists but user not found" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        await adminClient.auth.admin.updateUserById(foundId, {
          password, email_confirm: true,
          user_metadata: fullName ? { full_name: fullName } : undefined,
        });
        newUserId = foundId;
      } else {
        newUserId = created?.user?.id ?? null;
      }
      if (!newUserId) {
        return new Response(JSON.stringify({ error: "Failed to create user" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      try {
        // Profile: skip onboarding + auto-approve. Upsert in case the
        // handle_new_user trigger isn't installed / didn't fire.
        const { error: profErr } = await adminClient
          .from("profiles")
          .upsert({
            user_id: newUserId,
            full_name: fullName ?? null,
            legal_entity_id: legalEntityId ?? null,
            office_site_id: officeSiteId ?? null,
            department_id: departmentId ?? null,
            onboarded: true,
            approved_at: new Date().toISOString(),
          }, { onConflict: "user_id" });
        if (profErr) throw profErr;

        // Replace default global role with chosen role
        await adminClient.from("user_roles")
          .delete()
          .eq("user_id", newUserId)
          .eq("scope_type", "global");
        const { error: roleErr } = await adminClient.from("user_roles").insert({
          user_id: newUserId, role: finalRole, scope_type: "global", scope_id: null,
        });
        if (roleErr) throw roleErr;
      } catch (e: any) {
        // Roll back only if WE just created this auth user
        if (!createErr) await adminClient.auth.admin.deleteUser(newUserId).catch(() => {});
        return new Response(JSON.stringify({ error: e.message ?? "Failed to finalize user" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, userId: newUserId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "approve") {
      const { userId } = body;
      if (!userId) {
        return new Response(JSON.stringify({ error: "userId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Auto-confirm the user's email on approval
      const { error: confirmError } = await adminClient.auth.admin.updateUserById(userId, {
        email_confirm: true,
      });

      if (confirmError) {
        return new Response(JSON.stringify({ error: confirmError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await adminClient
        .from("profiles")
        .update({ approved_at: new Date().toISOString() })
        .eq("user_id", userId);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reject") {
      const { userId } = body;
      if (!userId) {
        return new Response(JSON.stringify({ error: "userId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (userId === callerId) {
        return new Response(
          JSON.stringify({ error: "You cannot reject yourself" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const { error } = await adminClient.auth.admin.deleteUser(userId);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "ban") {
      const { userId } = body;
      if (!userId) {
        return new Response(JSON.stringify({ error: "userId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (userId === callerId) {
        return new Response(
          JSON.stringify({ error: "You cannot ban yourself" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const { error: banError } =
        await adminClient.auth.admin.updateUserById(userId, {
          ban_duration: "876600h",
        });

      if (banError) {
        return new Response(JSON.stringify({ error: banError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await adminClient
        .from("profiles")
        .update({ banned_at: new Date().toISOString() })
        .eq("user_id", userId);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "change-password") {
      const { userId, newPassword } = body;
      if (!userId || !newPassword) {
        return new Response(JSON.stringify({ error: "userId and newPassword are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (newPassword.length < 6) {
        return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: pwError } = await adminClient.auth.admin.updateUserById(userId, {
        password: newPassword,
      });

      if (pwError) {
        return new Response(JSON.stringify({ error: pwError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "unban") {
      const { userId } = body;
      if (!userId) {
        return new Response(JSON.stringify({ error: "userId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: unbanError } =
        await adminClient.auth.admin.updateUserById(userId, {
          ban_duration: "none",
        });

      if (unbanError) {
        return new Response(JSON.stringify({ error: unbanError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await adminClient
        .from("profiles")
        .update({ banned_at: null })
        .eq("user_id", userId);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete-user") {
      const { userId } = body;
      if (!userId) {
        return new Response(JSON.stringify({ error: "userId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (userId === callerId) {
        return new Response(JSON.stringify({ error: "You cannot delete yourself" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Best-effort cleanup of related rows. Documents and activity logs are
      // intentionally retained for auditing — they already snapshot the
      // user's name/department at creation time.
      await adminClient.from("user_role_assignments").delete().eq("user_id", userId);
      await adminClient.from("user_roles").delete().eq("user_id", userId);
      await adminClient.from("profiles").delete().eq("user_id", userId);

      const { error: delErr } = await adminClient.auth.admin.deleteUser(userId);
      if (delErr) {
        return new Response(JSON.stringify({ error: delErr.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
