import { render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { expect, it } from 'vitest';

import en from '../../../../public/locales/en/common.json';
import hi from '../../../../public/locales/hi/common.json';
import { AssistantBriefingError } from '../assistant.types';

import { AssistantFailure } from './AssistantConversationView';

it.each(['en', 'hi'])(
  'renders the shipped %s safety warning for both initial and follow-up answers',
  async language => {
    const common = language === 'en' ? en : hi;
    const i18n = createInstance();
    await i18n.init({
      lng: language,
      resources: { [language]: { translation: common } },
      interpolation: { escapeValue: false },
    });
    const error = new AssistantBriefingError('response_safety_limit', false);
    render(
      <I18nextProvider i18n={i18n}>
        <AssistantFailure error={error} operation='briefing' />
        <AssistantFailure error={error} />
      </I18nextProvider>
    );
    expect(screen.getAllByText(common.assistant.failure.response_safety_limit)).toHaveLength(2);
    expect(common.assistant.failure.response_safety_limit).not.toBe(
      common.assistant.failure.context_too_large
    );
  }
);
