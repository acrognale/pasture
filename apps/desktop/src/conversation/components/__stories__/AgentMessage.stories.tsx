import type { Meta, StoryObj } from '@storybook/react-vite';
import type { TranscriptAgentMessageCell } from '~/conversation/transcript/types';

import { AgentMessage } from '../AgentMessage';

const meta: Meta<typeof AgentMessage> = {
  title: 'Components/Message/AgentMessage',
  component: AgentMessage,
  parameters: {
    layout: 'padded',
  },
};

export default meta;

type Story = StoryObj<typeof AgentMessage>;

const createCell = (
  overrides: Partial<TranscriptAgentMessageCell>
): TranscriptAgentMessageCell => ({
  id: 'agent-1',
  timestamp: new Date().toISOString(),
  eventIds: ['evt-1'],
  kind: 'agent-message',
  message: 'Default agent message',
  streaming: false,
  itemId: null,
  ...overrides,
});

export const Simple: Story = {
  args: {
    cell: createCell({
      message: 'I can help you with that. Let me analyze the code first.',
    }),
    index: 1,
    timestamp: new Date().toISOString(),
  },
};

export const WithMarkdown: Story = {
  args: {
    cell: createCell({
      message: `I found the issue! The problem is in the \`handleSubmit\` function.

Here's the fix:

\`\`\`typescript
function handleSubmit(data: FormData) {
  // Validate before submission
  if (!data.email || !data.password) {
    throw new Error('Missing required fields');
  }

  return submitForm(data);
}
\`\`\`

This should resolve the validation error.`,
    }),
    index: 2,
    timestamp: new Date().toISOString(),
  },
};

export const Streaming: Story = {
  args: {
    cell: createCell({
      message:
        'I am currently analyzing your request and will provide a response shortly',
      streaming: true,
    }),
    index: 3,
    timestamp: new Date().toISOString(),
  },
};

export const Empty: Story = {
  args: {
    cell: createCell({
      message: '',
    }),
    index: 4,
    timestamp: new Date().toISOString(),
  },
};

export const LongResponse: Story = {
  args: {
    cell: createCell({
      message: `## Analysis Complete

I've analyzed the codebase and found several areas that need attention:

### 1. Authentication System

The current authentication implementation has some security concerns:

- **JWT tokens don't expire**: This is a critical security issue
- **No refresh token mechanism**: Users must re-login frequently
- **Passwords stored in plaintext**: MAJOR security vulnerability

### 2. Database Schema

The schema needs optimization:

\`\`\`sql
-- Current schema
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT,
  password TEXT  -- Should be hashed!
);

-- Recommended schema
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
\`\`\`

### 3. API Endpoints

Several endpoints are missing proper validation:

1. \`POST /api/users\` - No email validation
2. \`PUT /api/users/:id\` - No authorization check
3. \`DELETE /api/users/:id\` - Anyone can delete any user!

### Recommended Actions

Here's a prioritized list:

1. **Immediate**: Hash passwords before storing
2. **High Priority**: Add JWT expiration
3. **Medium Priority**: Implement refresh tokens
4. **Low Priority**: Optimize database indices

### Implementation Example

\`\`\`typescript
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

function generateToken(userId: number): string {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }  // Token expires in 24 hours
  );
}
\`\`\`

Would you like me to implement these changes?`,
    }),
    index: 5,
    timestamp: new Date().toISOString(),
  },
};

export const WithCodeBlock: Story = {
  args: {
    cell: createCell({
      message: `Here's how to implement the feature:

\`\`\`typescript
interface User {
  id: number;
  email: string;
  name: string;
}

async function fetchUser(id: number): Promise<User> {
  const response = await fetch(\`/api/users/\${id}\`);
  if (!response.ok) {
    throw new Error('Failed to fetch user');
  }
  return response.json();
}
\`\`\`

You can use this in your component like this:

\`\`\`tsx
function UserProfile({ userId }: { userId: number }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    fetchUser(userId).then(setUser);
  }, [userId]);

  if (!user) return <div>Loading...</div>;

  return <div>{user.name}</div>;
}
\`\`\``,
    }),
    index: 6,
    timestamp: new Date().toISOString(),
  },
};

export const WithList: Story = {
  args: {
    cell: createCell({
      message: `I've identified the following files that need updates:

1. **src/components/Auth.tsx** - Update authentication logic
2. **src/lib/api.ts** - Add new API endpoints
3. **src/types/user.ts** - Update user type definitions
4. **README.md** - Document the new features

Next steps:
- Review the proposed changes
- Run the test suite
- Deploy to staging environment`,
    }),
    index: 7,
    timestamp: new Date().toISOString(),
  },
};

export const Conversation: Story = {
  render: () => (
    <div className="flex flex-col gap-1 max-w-3xl">
      <AgentMessage
        cell={createCell({
          message: 'Let me search for authentication-related files.',
        })}
        index={1}
        timestamp={new Date().toISOString()}
      />
      <AgentMessage
        cell={createCell({
          message:
            'I found 3 files. Let me analyze the authentication implementation.',
          streaming: true,
        })}
        index={2}
        timestamp={new Date().toISOString()}
      />
      <AgentMessage
        cell={createCell({
          message: `Found the issue! The \`verifyToken\` function doesn't check expiration.

\`\`\`typescript
function verifyToken(token: string) {
  const decoded = jwt.verify(token, SECRET);
  // Missing: check if token is expired
  return decoded;
}
\`\`\`

I'll fix this now.`,
        })}
        index={3}
        timestamp={new Date().toISOString()}
      />
    </div>
  ),
};
