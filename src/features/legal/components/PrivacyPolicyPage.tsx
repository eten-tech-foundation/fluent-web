export const PrivacyPolicyPage = () => {
  return (
    <div className='bg-background h-full w-full overflow-y-auto'>
      <div className='container mx-auto max-w-3xl px-6 py-6'>
        <h1 className='mb-8 text-3xl font-bold'>Privacy Policy</h1>
        <div className='mx-auto max-w-3xl text-base leading-relaxed'>
          <p>
            Fluent offers an AI-generated draft feature to help you create initial translations more
            efficiently. This system may send your translated verses and related translation
            resources to an AI model for processing. Your data will not be used for model training.
            OR Your data may be used for model training. The resulting text is a machine-generated
            suggestion only — it may contain errors or inaccuracies and must be reviewed by a human
            translator before acceptance.
          </p>

          <p>
            Unless specified otherwise we do not share your information with third-parties. We will,
            however, collect basic information that is needed to run the application successfully.
            By continuing, you agree to the use of your translations to aid with creating
            AI-generated content.
          </p>
        </div>
      </div>
    </div>
  );
};
