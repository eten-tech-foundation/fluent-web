import { useTranslation } from 'react-i18next';

export function HomePage(): JSX.Element {
  const { t } = useTranslation();

  return (
    <div className='space-y-8'>
      <div className='space-y-6'>
        <h1 className='text-3xl font-bold'>{t(`dashboard`)}</h1>
        <p className='text-muted-foreground text-lg'>{t(`welcome`)}</p>
      </div>
    </div>
  );
}
