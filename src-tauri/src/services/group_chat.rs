use std::sync::Arc;

use crate::models::*;
use crate::services::storage::StorageService;

/// Group management backed by SQLite via StorageService
pub struct GroupService {
    storage: Arc<StorageService>,
}

impl GroupService {
    pub fn new(storage: Arc<StorageService>) -> Self {
        Self { storage }
    }

    /// Initialize a group with the creator as owner
    pub fn create_group(&self, chat_id: &str, creator_id: &str, creator_name: &str) {
        let member = GroupMember {
            user_id: creator_id.to_string(),
            display_name: creator_name.to_string(),
            role: GroupRole::Owner,
            joined_at: chrono::Utc::now(),
        };
        let _ = self.storage.save_group_member(chat_id, &member);
    }

    /// Add a member to a group
    pub fn add_member(
        &self,
        chat_id: &str,
        user_id: &str,
        display_name: &str,
    ) -> Result<(), String> {
        let members = self.storage.get_group_members(chat_id)?;
        if members.iter().any(|m| m.user_id == user_id) {
            return Err("User is already a member".to_string());
        }

        let member = GroupMember {
            user_id: user_id.to_string(),
            display_name: display_name.to_string(),
            role: GroupRole::Member,
            joined_at: chrono::Utc::now(),
        };
        self.storage.save_group_member(chat_id, &member)
    }

    /// Remove a member from a group
    pub fn remove_member(&self, chat_id: &str, user_id: &str) -> Result<(), String> {
        let members = self.storage.get_group_members(chat_id)?;
        let member = members
            .iter()
            .find(|m| m.user_id == user_id)
            .ok_or("User not in group")?;
        if member.role == GroupRole::Owner {
            return Err("Cannot remove the owner".to_string());
        }
        self.storage.delete_group_member(chat_id, user_id)
    }

    /// Update a member's role (only owner can promote/demote)
    pub fn update_role(
        &self,
        chat_id: &str,
        actor_id: &str,
        target_id: &str,
        new_role: GroupRole,
    ) -> Result<(), String> {
        let members = self.storage.get_group_members(chat_id)?;

        let actor = members.iter().find(|m| m.user_id == actor_id);
        match actor {
            Some(a) if a.role == GroupRole::Owner => {}
            _ => return Err("Only the owner can change roles".to_string()),
        }

        let target = members
            .iter()
            .find(|m| m.user_id == target_id)
            .ok_or("Target user not in group")?;
        if target.role == GroupRole::Owner {
            return Err("Cannot change the owner's role".to_string());
        }

        let mut updated = target.clone();
        updated.role = new_role;
        self.storage.save_group_member(chat_id, &updated)
    }

    /// Generate an invite link
    pub fn create_invite(
        &self,
        chat_id: &str,
        created_by: &str,
        max_uses: Option<u32>,
        expires_in_hours: Option<u32>,
    ) -> Result<GroupInvite, String> {
        let code = uuid::Uuid::new_v4().to_string()[..8].to_string();
        let expires_at =
            expires_in_hours.map(|h| chrono::Utc::now() + chrono::Duration::hours(h as i64));

        let invite = GroupInvite {
            code: code.clone(),
            chat_id: chat_id.to_string(),
            created_by: created_by.to_string(),
            created_at: chrono::Utc::now(),
            expires_at,
            max_uses,
            use_count: 0,
        };

        self.storage.save_group_invite(&invite)?;
        Ok(invite)
    }

    /// Join a group via invite code
    pub fn join_via_invite(
        &self,
        code: &str,
        user_id: &str,
        display_name: &str,
    ) -> Result<String, String> {
        let mut invite = self
            .storage
            .get_group_invite(code)?
            .ok_or("Invalid invite code")?;

        if let Some(expires) = invite.expires_at {
            if chrono::Utc::now() > expires {
                return Err("Invite has expired".to_string());
            }
        }

        if let Some(max) = invite.max_uses {
            if invite.use_count >= max {
                return Err("Invite has reached maximum uses".to_string());
            }
        }

        let chat_id = invite.chat_id.clone();
        invite.use_count += 1;
        self.storage.save_group_invite(&invite)?;

        self.add_member(&chat_id, user_id, display_name)?;
        Ok(chat_id)
    }

    /// Leave a group
    pub fn leave_group(&self, chat_id: &str, user_id: &str) -> Result<(), String> {
        let members = self.storage.get_group_members(chat_id)?;
        let member = members
            .iter()
            .find(|m| m.user_id == user_id)
            .ok_or("User not in group")?;
        if member.role == GroupRole::Owner {
            return Err("Owner cannot leave; transfer ownership first".to_string());
        }
        self.storage.delete_group_member(chat_id, user_id)
    }

    /// Get all members of a group
    pub fn get_members(&self, chat_id: &str) -> Vec<GroupMember> {
        self.storage.get_group_members(chat_id).unwrap_or_default()
    }

    /// Get a specific member's role
    pub fn get_member_role(&self, chat_id: &str, user_id: &str) -> Option<GroupRole> {
        let members = self.storage.get_group_members(chat_id).ok()?;
        members
            .iter()
            .find(|m| m.user_id == user_id)
            .map(|m| m.role.clone())
    }

    /// Check if user is admin or owner
    pub fn is_admin_or_above(&self, chat_id: &str, user_id: &str) -> bool {
        matches!(
            self.get_member_role(chat_id, user_id),
            Some(GroupRole::Owner) | Some(GroupRole::Admin)
        )
    }

    /// Delete a group and all its data
    pub fn delete_group(&self, chat_id: &str) {
        let _ = self.storage.delete_group_members(chat_id);
        let _ = self.storage.delete_group_invites_for_chat(chat_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> (tempfile::TempDir, GroupService) {
        let dir = tempfile::tempdir().unwrap();
        let storage = Arc::new(StorageService::new(dir.path().to_path_buf()).unwrap());
        (dir, GroupService::new(storage))
    }

    #[test]
    fn creator_becomes_owner() {
        let (_dir, svc) = setup();
        svc.create_group("g1", "alice", "Alice");
        assert_eq!(svc.get_member_role("g1", "alice"), Some(GroupRole::Owner));
        assert!(svc.is_admin_or_above("g1", "alice"));
    }

    #[test]
    fn duplicate_member_rejected() {
        let (_dir, svc) = setup();
        svc.create_group("g1", "alice", "Alice");
        svc.add_member("g1", "bob", "Bob").unwrap();
        assert!(svc.add_member("g1", "bob", "Bob").is_err());
    }

    #[test]
    fn owner_cannot_be_removed_or_leave() {
        let (_dir, svc) = setup();
        svc.create_group("g1", "alice", "Alice");
        assert!(svc.remove_member("g1", "alice").is_err());
        assert!(svc.leave_group("g1", "alice").is_err());
    }

    #[test]
    fn only_owner_changes_roles() {
        let (_dir, svc) = setup();
        svc.create_group("g1", "alice", "Alice");
        svc.add_member("g1", "bob", "Bob").unwrap();
        svc.add_member("g1", "carol", "Carol").unwrap();

        assert!(svc
            .update_role("g1", "bob", "carol", GroupRole::Admin)
            .is_err());
        svc.update_role("g1", "alice", "bob", GroupRole::Admin)
            .unwrap();
        assert_eq!(svc.get_member_role("g1", "bob"), Some(GroupRole::Admin));
        assert!(svc.is_admin_or_above("g1", "bob"));
        // Even an admin cannot touch the owner
        assert!(svc
            .update_role("g1", "bob", "alice", GroupRole::Member)
            .is_err());
    }

    #[test]
    fn invite_lifecycle() {
        let (_dir, svc) = setup();
        svc.create_group("g1", "alice", "Alice");

        let invite = svc.create_invite("g1", "alice", Some(1), None).unwrap();
        assert_eq!(invite.code.len(), 8);

        let chat_id = svc.join_via_invite(&invite.code, "bob", "Bob").unwrap();
        assert_eq!(chat_id, "g1");
        assert_eq!(svc.get_member_role("g1", "bob"), Some(GroupRole::Member));

        // max_uses = 1 exhausted
        assert!(svc.join_via_invite(&invite.code, "carol", "Carol").is_err());
        // unknown code
        assert!(svc.join_via_invite("bogus123", "dave", "Dave").is_err());
    }

    #[test]
    fn expired_invite_rejected() {
        let (_dir, svc) = setup();
        svc.create_group("g1", "alice", "Alice");
        let invite = svc.create_invite("g1", "alice", None, Some(0)).unwrap();
        assert!(svc.join_via_invite(&invite.code, "bob", "Bob").is_err());
    }

    #[test]
    fn member_can_leave_and_delete_group_clears_state() {
        let (_dir, svc) = setup();
        svc.create_group("g1", "alice", "Alice");
        svc.add_member("g1", "bob", "Bob").unwrap();
        svc.leave_group("g1", "bob").unwrap();
        assert_eq!(svc.get_member_role("g1", "bob"), None);

        svc.delete_group("g1");
        assert!(svc.get_members("g1").is_empty());
    }
}
