import { createFileRoute } from '@tanstack/react-router';
import { ImageResponse } from 'workers-og';

export const Route = createFileRoute('/api/og/$id')({
  server: {
    handlers: {
      GET: async ({ params, context }) => {
        const db = context.db();
        const { id } = params;

        // Fetch the shared thread
        const share = await db
          .selectFrom('SharedThread')
          .select(['title', 'model', 'createdAt', 'transcript'])
          .where('id', '=', id)
          .executeTakeFirst();

        if (!share) {
          return new Response('Not found', { status: 404 });
        }

        const title = share.title || 'Untitled Thread';
        const model = share.model || 'Claude';
        const date = new Date(share.createdAt);
        const formattedDate = date.toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        });

        // Extract first user message from transcript
        let firstMessage = '';
        try {
          const transcript = share.transcript as any;
          if (transcript?.turns && transcript?.turnOrder) {
            const firstTurnId = transcript.turnOrder[0];
            const firstTurn = transcript.turns[firstTurnId];
            if (firstTurn?.cells) {
              const userCell = firstTurn.cells.find(
                (cell: any) => cell.kind === 'user-message'
              );
              if (userCell?.message) {
                // Truncate to ~150 characters for OG image
                firstMessage = userCell.message.slice(0, 150);
                if (userCell.message.length > 150) {
                  firstMessage += '...';
                }
              }
            }
          }
        } catch (error) {
          console.error('Error extracting first message:', error);
        }

        try {
          return new ImageResponse(
            (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  width: '100%',
                  height: '100%',
                  background: 'linear-gradient(180deg, #F9F7F4 0%, #F2EFE9 100%)',
                  padding: '80px',
                  fontFamily: 'system-ui, sans-serif',
                  position: 'relative',
                }}
              >
                {/* Rolling hills background effect */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: '0',
                    left: '0',
                    right: '0',
                    height: '200px',
                    background:
                      'radial-gradient(ellipse 600px 200px at 20% 100%, rgba(174, 222, 150, 0.25) 0%, transparent 70%), radial-gradient(ellipse 500px 180px at 80% 100%, rgba(174, 222, 150, 0.20) 0%, transparent 60%)',
                    display: 'flex',
                  }}
                />

                {/* Pasture branding - top right */}
                <div
                  style={{
                    position: 'absolute',
                    top: '60px',
                    right: '80px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  {/* Pasture logo */}
                  <img
                    src="https://pasture.dev/logo-96.png"
                    width={40}
                    height={40}
                    style={{
                      borderRadius: '8px',
                    }}
                  />
                  <span
                    style={{
                      fontSize: '24px',
                      fontWeight: '600',
                      color: '#25231F',
                      letterSpacing: '-0.02em',
                    }}
                  >
                    Pasture
                  </span>
                </div>

                {/* Badge: "Shared Conversation" */}
                <div
                  style={{
                    display: 'flex',
                    marginBottom: '32px',
                    marginTop: '40px',
                  }}
                >
                  <div
                    style={{
                      background: 'rgba(123, 200, 92, 0.15)',
                      border: '2px solid rgba(123, 200, 92, 0.3)',
                      borderRadius: '12px',
                      padding: '8px 20px',
                      fontSize: '16px',
                      fontWeight: '600',
                      color: '#4A8435',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      display: 'flex',
                    }}
                  >
                    Shared Conversation
                  </div>
                </div>

                {/* Title */}
                <div
                  style={{
                    fontSize: title.length > 50 ? '56px' : '72px',
                    fontWeight: '700',
                    color: '#25231F',
                    lineHeight: '1.15',
                    marginBottom: firstMessage ? '24px' : '40px',
                    maxWidth: '900px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    fontFamily: 'Georgia, serif',
                  }}
                >
                  {title}
                </div>

                {/* First message preview */}
                {firstMessage && (
                  <div
                    style={{
                      fontSize: '24px',
                      fontWeight: '400',
                      color: '#6B6863',
                      lineHeight: '1.5',
                      marginBottom: '32px',
                      maxWidth: '900px',
                      display: 'flex',
                      fontStyle: 'italic',
                    }}
                  >
                    "{firstMessage}"
                  </div>
                )}

                {/* Metadata pills */}
                <div
                  style={{
                    display: 'flex',
                    gap: '16px',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  {/* Model badge */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      background: '#FFFFFF',
                      border: '2px solid rgba(123, 200, 92, 0.2)',
                      borderRadius: '100px',
                      padding: '12px 24px',
                    }}
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#7BC85C"
                      strokeWidth="2"
                    >
                      <path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z" />
                      <path d="M12 12v10" />
                      <path d="M8 18h8" />
                    </svg>
                    <span
                      style={{
                        fontSize: '22px',
                        fontWeight: '500',
                        color: '#3D3B37',
                      }}
                    >
                      {model}
                    </span>
                  </div>

                  {/* Date */}
                  <div
                    style={{
                      fontSize: '20px',
                      color: '#6B6863',
                      fontStyle: 'italic',
                      display: 'flex',
                    }}
                  >
                    {formattedDate}
                  </div>
                </div>

                {/* Bottom decorative element */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: '60px',
                    left: '80px',
                    right: '80px',
                    height: '2px',
                    background:
                      'linear-gradient(90deg, transparent 0%, rgba(123, 200, 92, 0.3) 50%, transparent 100%)',
                    display: 'flex',
                  }}
                />
              </div>
            ),
            {
              width: 1200,
              height: 630,
            }
          );
        } catch (error) {
          console.error('OG Image generation error:', error);
          return new Response('Failed to generate image', { status: 500 });
        }
      },
    },
  },
});
