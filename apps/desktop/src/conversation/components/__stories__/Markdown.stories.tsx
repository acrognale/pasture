import type { Meta, StoryObj } from '@storybook/react-vite';

import { Markdown } from '../Markdown';

const meta: Meta<typeof Markdown> = {
  title: 'Components/Message/Markdown',
  component: Markdown,
  parameters: {
    layout: 'padded',
  },
};

export default meta;

type Story = StoryObj<typeof Markdown>;

export const Basic: Story = {
  args: {
    children:
      'This is a basic markdown paragraph with **bold** and *italic* text.',
  },
};

export const Headers: Story = {
  args: {
    children: `# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6

Regular paragraph text following the headers.`,
  },
};

export const CodeBlocks: Story = {
  args: {
    children: `Here's an inline code example: \`const foo = 'bar'\`.

And here's a code block:

\`\`\`typescript
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

console.log(greet('World'));
\`\`\``,
  },
};

export const Lists: Story = {
  args: {
    children: `Unordered list:
- First item
- Second item
  - Nested item
  - Another nested item
- Third item

Ordered list:
1. First step
2. Second step
3. Third step`,
  },
};

export const Links: Story = {
  args: {
    children: `Check out [this link](https://example.com) for more information.

You can also use autolinks: https://example.com`,
  },
};

export const Blockquotes: Story = {
  args: {
    children: `Normal text here.

> This is a blockquote.
> It can span multiple lines.
>
> And even include multiple paragraphs.

More normal text.`,
  },
};

export const Tables: Story = {
  args: {
    children: `| Feature | Status | Notes |
|---------|--------|-------|
| Authentication | ✅ Complete | JWT-based |
| Authorization | 🚧 In Progress | RBAC implementation |
| API Docs | ❌ Not Started | OpenAPI planned |`,
  },
};

export const Mixed: Story = {
  args: {
    children: `## Code Review Summary

I've analyzed the authentication implementation and found a few issues:

### Issues Found

1. **Security vulnerability** - JWT tokens don't expire
2. Password validation is too weak
3. Missing rate limiting on login endpoint

### Recommended Changes

Here's the updated validation function:

\`\`\`typescript
function validatePassword(password: string): boolean {
  const minLength = 12;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*]/.test(password);

  return (
    password.length >= minLength &&
    hasUpperCase &&
    hasLowerCase &&
    hasNumbers &&
    hasSpecialChar
  );
}
\`\`\`

### Next Steps

- [ ] Implement token expiration
- [ ] Update password validation
- [ ] Add rate limiting middleware

> **Note**: These changes should be deployed in the next release cycle.

For more details, see the [security guidelines](https://example.com/security).`,
  },
};

export const AgentResponse: Story = {
  args: {
    children: `I found the issue in the turn review pane. The problem is in \`TurnReviewContext.tsx\` where the diff calculation doesn't account for cumulative changes.

**Root Cause:**
- The \`loadDiff\` function only compares adjacent turns
- It doesn't track the workspace start state properly
- Base turn selection doesn't trigger a full recalculation

**Solution:**

I'll modify the diff loading logic to:

\`\`\`typescript
const loadCumulativeDiff = async (fromTurn: number, toTurn: number) => {
  // Always diff from workspace start, not from previous turn
  const baseSnapshot = await fetchSnapshot('workspace-start');
  const targetSnapshot = await fetchSnapshot(\`turn-\${toTurn}\`);

  return computeDiff(baseSnapshot, targetSnapshot);
};
\`\`\`

**Testing:**
\`\`\`bash
npm test -- --run src/review/__tests__/turn-review.test.tsx
\`\`\`

Would you like me to proceed with this implementation?`,
  },
};

export const Strikethrough: Story = {
  args: {
    children: `This feature is ~~deprecated~~ no longer supported. Use the new API instead.`,
  },
};

export const HorizontalRule: Story = {
  args: {
    children: `Section 1

---

Section 2

---

Section 3`,
  },
};

export const ComplexNesting: Story = {
  args: {
    children: `### Implementation Plan

1. **Phase 1: Setup**
   - Create new component structure
   - Set up state management
   - \`npm install @tanstack/react-query\`

2. **Phase 2: Core Features**
   - Implement data fetching
     - Use \`useQuery\` hook
     - Handle loading states
   - Add error boundaries

3. **Phase 3: Testing**
   > Remember to test all edge cases!

   \`\`\`typescript
   describe('Component', () => {
     it('should render correctly', () => {
       // Test implementation
     });
   });
   \`\`\`

**Progress:**
- [x] Planning
- [x] Setup
- [ ] Implementation
- [ ] Testing`,
  },
};
