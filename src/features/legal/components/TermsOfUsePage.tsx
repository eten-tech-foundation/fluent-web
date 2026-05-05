export const TermsOfUsePage = () => {
  return (
    <div className='bg-background h-full w-full overflow-y-auto'>
      <div className='container mx-auto max-w-3xl px-6 py-6'>
        <h1 className='mb-8 text-3xl font-bold'>Terms of Use</h1>
        <div className='mx-auto max-w-3xl text-base leading-relaxed'>
          <p>
            Fluent provides optional tools that use artificial intelligence (“AI”) to generate
            initial translation drafts or text suggestions. These drafts are provided solely to
            assist translators and do not constitute authoritative or verified translations.
          </p>

          <p>
            Users are responsible for reviewing, editing, and validating all AI-generated text
            before any form of publication or distribution. Fluent and its partners make no
            representations or warranties regarding the accuracy, completeness, or reliability of
            AI-generated content.
          </p>

          <p>By using these features, you acknowledge that:</p>
          <ul className='list-disc space-y-2 pl-6'>
            <li>
              AI-generated drafts may contain factual or linguistic errors, omissions, or cultural
              inaccuracies.
            </li>
            <li>All final translation responsibility rests with the user or translation team.</li>
            <li>
              AI outputs are generated automatically and are not endorsed by Fluent or its
              affiliated organizations.
            </li>
          </ul>
          <p>
            If AI services are provided by third parties, the processing of text data will comply
            with Fluent’s Privacy Policy, which describes what data may be transmitted and how it is
            protected.
          </p>
        </div>
      </div>
    </div>
  );
};
