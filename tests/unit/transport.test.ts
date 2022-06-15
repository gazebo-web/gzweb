import {Transport} from '../../src/transport'

// Tests for default construction
describe('transport construction', () => {
  // Create the transport object
  let transport: Transport = new Transport();

  test('world name is empty', () => {
    expect(transport.getWorld()).toBe('');
  });

  test('available topics are empty', () => {
    expect(transport.getAvailableTopics()).toHaveLength(0);
  });

  test('subscribed topics are empty', () => {
    expect(transport.getSubscribedTopics().size).toBe(0);
  });
});
