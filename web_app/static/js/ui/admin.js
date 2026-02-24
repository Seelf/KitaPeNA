
// Admin Console Logic
export function initAdminConsole() {
    const btnAdmin = document.getElementById('btnAdminConsole');
    const modal = document.getElementById('adminModal');
    const btnClose = document.getElementById('btnCloseAdmin');
    const tableBody = document.getElementById('userTableBody');

    if (!btnAdmin) return;

    btnAdmin.addEventListener('click', () => {
        modal.style.display = 'flex';
        fetchUsers();
    });

    btnClose.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    // Close on click outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });

    // Change Password
    document.getElementById('btnChangeAdminPass').addEventListener('click', async () => {
        const pass = document.getElementById('inputNewAdminPass').value;
        if (!pass) return alert('Enter a password');

        const res = await fetch('/api/admin/password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
            body: JSON.stringify({ password: pass })
        });

        if (res.ok) {
            alert('Password updated');
            document.getElementById('inputNewAdminPass').value = '';
        } else {
            alert('Error updating password');
        }
    });

    // Add User
    document.getElementById('btnAddUser').addEventListener('click', async () => {
        const username = document.getElementById('inputNewUser').value;
        const password = document.getElementById('inputNewPass').value;
        const role = document.getElementById('selectNewRole').value;

        if (!username || !password) return alert('Fill all fields');

        const res = await fetch('/api/admin/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
            body: JSON.stringify({ username, password, role })
        });

        if (res.ok) {
            fetchUsers();
            document.getElementById('inputNewUser').value = '';
            document.getElementById('inputNewPass').value = '';
        } else {
            const data = await res.json();
            alert(data.error || 'Failed to add user');
        }
    });

    async function fetchUsers() {
        const res = await fetch('/api/admin/users');
        if (!res.ok) return;
        const users = await res.json();
        renderUsers(users);
    }

    function renderUsers(users) {
        tableBody.innerHTML = '';
        users.forEach(u => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid #444';

            const statusColor = u.is_blocked ? '#ff4444' : '#44ff44';
            const statusText = u.is_blocked ? 'Blocked' : 'Active';

            tr.innerHTML = `
                <td style="padding: 8px;">${u.id}</td>
                <td style="padding: 8px; font-weight: bold;">${u.username}</td>
                <td style="padding: 8px;">${u.role}</td>
                <td style="padding: 8px; color: ${statusColor};">${statusText}</td>
                <td style="padding: 8px;">
                    <div style="display: flex; gap: 5px;">
                        <button class="btn small btn-block" data-id="${u.id}" data-blocked="${u.is_blocked}">
                            ${u.is_blocked ? 'Unblock' : 'Block'}
                        </button>
                        <button class="btn small danger btn-delete" data-id="${u.id}">Del</button>
                    </div>
                </td>
            `;
            tableBody.appendChild(tr);
        });

        // Bind Block actions
        document.querySelectorAll('.btn-block').forEach(b => {
            b.addEventListener('click', async (e) => {
                const id = e.target.dataset.id;
                const isBlocked = e.target.dataset.blocked === '1' || e.target.dataset.blocked === 'true';
                await toggleBlock(id, !isBlocked);
            });
        });

        // Bind Delete actions
        document.querySelectorAll('.btn-delete').forEach(b => {
            b.addEventListener('click', async (e) => {
                if (confirm('Delete user?')) {
                    await deleteUser(e.target.dataset.id);
                }
            });
        });
    }

    async function toggleBlock(id, block) {
        await fetch(`/api/admin/users/${id}/block`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
            body: JSON.stringify({ block })
        });
        fetchUsers();
    }

    async function deleteUser(id) {
        await fetch(`/api/admin/users/${id}`, {
            method: 'DELETE',
            headers: { 'X-CSRFToken': getCsrfToken() }
        });
        fetchUsers();
    }

    function getCsrfToken() {
        return document.querySelector('meta[name="csrf-token"]')?.content;
    }
}
