#!/usr/bin/env ruby
# frozen_string_literal: true
#
# Fail if any action reference in this repo's workflow or composite-action YAML
# is not pinned to a full 40-character commit SHA.
#
# Tags are mutable: whoever controls the action can re-point `@v4` at a new
# commit, and the next workflow run picks it up with no review. A SHA pin
# freezes the exact commit that was reviewed.
#
# This parses the YAML rather than grepping it. A line-based scan gets four
# distinct cases wrong: it misses flow-style steps (`- { uses: x@v4 }`), and it
# misreports quoted refs, quoted local refs, and any `uses:` text that happens
# to appear inside a `run: |` block.
#
# Exit 0 = all pinned. Exit 1 = violations found. Exit 2 = could not parse.

require 'yaml'

SHA_REF   = /\A[^@]+@[0-9a-f]{40}\z/          # owner/repo[/path]@<40-hex>
LOCAL_REF = %r{\A\./}                          # ./path — resolves in-repo
DOCKER_REF = %r{\Adocker://.+@sha256:[0-9a-f]{64}\z}

SCAN_DIRS = ['.github/workflows', '.github/actions'].freeze

# Yield [value, line] for every `uses:` key anywhere in the document tree.
def each_uses(node, &blk)
  case node
  when Psych::Nodes::Mapping
    node.children.each_slice(2) do |key, value|
      if key.is_a?(Psych::Nodes::Scalar) && key.value == 'uses' &&
         value.is_a?(Psych::Nodes::Scalar)
        blk.call(value.value, value.start_line + 1)
      else
        each_uses(value, &blk)
      end
    end
  when Psych::Nodes::Sequence, Psych::Nodes::Document, Psych::Nodes::Stream
    node.children.each { |child| each_uses(child, &blk) }
  end
end

def pinned?(ref)
  return true if ref.match?(LOCAL_REF)
  return true if ref.start_with?('docker://') && ref.match?(DOCKER_REF)
  ref.match?(SHA_REF)
end

dirs = SCAN_DIRS.select { |d| Dir.exist?(d) }
if dirs.empty?
  puts "No #{SCAN_DIRS.join(' or ')} directory; nothing to check."
  exit 0
end

files = dirs.flat_map { |d| Dir.glob(File.join(d, '**', '*.{yml,yaml}')) }.sort
violations = []
checked = 0

files.each do |file|
  begin
    doc = Psych.parse_stream(File.read(file), filename: file)
  rescue Psych::SyntaxError => e
    warn "::error file=#{file}::Could not parse YAML: #{e.message}"
    exit 2
  end

  each_uses(doc) do |ref, line|
    checked += 1
    violations << [file, line, ref] unless pinned?(ref)
  end
end

unless violations.empty?
  puts 'Unpinned action references found. Every `uses:` must be a full ' \
       '40-character commit SHA.'
  puts
  violations.each do |file, line, ref|
    puts "::error file=#{file},line=#{line}::Not pinned to a commit SHA: #{ref}"
    puts "  #{file}:#{line}  #{ref}"
  end
  puts
  puts 'Pin to the SHA the tag resolves to, keeping the version as a comment:'
  puts '  uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1'
  puts
  puts "Exempt: local ./ refs, and docker:// refs pinned by @sha256 digest."
  exit 1
end

puts "All #{checked} action reference(s) across #{files.size} file(s) are " \
     'pinned to a commit SHA.'
