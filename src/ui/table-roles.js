// A table whose style sheet makes its parts block or grid boxes (a phone's summary table and status table) loses its table meaning for a screen reader: Safari and VoiceOver
// drop the semantics of an element that is no longer displayed as a table part (PC-4). The roles are written out, which a browser reads whatever the display says.
const ROLES = [['table', 'table'], ['thead, tbody, tfoot', 'rowgroup'], ['tr', 'row'], ['thead th', 'columnheader'], ['tbody th', 'rowheader'], ['td', 'cell']];

/** Gives every table part under `root` its own role (one already given is left); returns `root`. Run once, as the table is built. */
export function tableRoles(root) {
  for (const [sel, role] of ROLES) for (const e of root.querySelectorAll(sel)) if (!e.hasAttribute('role')) e.setAttribute('role', role);
  return root;
}
