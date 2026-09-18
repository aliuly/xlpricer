"""Unit tests for vbabb provenance-header helpers."""

from __future__ import annotations

import importlib.util
from importlib.machinery import SourceFileLoader
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from pyopenvba.excel import ExcelFile
from pyopenvba.vba import VBAModuleKind

# `vbabb` has no .py suffix, so load it as a module explicitly.
_LOADER = SourceFileLoader('vbabb', str(Path(__file__).with_name('vbabb')))
_SPEC = importlib.util.spec_from_loader('vbabb', _LOADER)
vbabb = importlib.util.module_from_spec(_SPEC)
sys.modules['vbabb'] = vbabb
_LOADER.exec_module(vbabb)


class HeaderFormatTest(unittest.TestCase):
  def test_clean_tracked(self):
    prov = vbabb.Provenance(
        source_path='prep.vba',
        version='v1.2.3-4-gabc1234',
        timestamp='2026-09-17T12:00:00+00:00',
        timestamp_source='commit',
        dirty=False,
    )
    header = vbabb.format_provenance_header(prov)
    self.assertEqual(header.splitlines(), [
        "' Source: prep.vba",
        "' Version: v1.2.3-4-gabc1234",
        "' Timestamp: 2026-09-17T12:00:00+00:00 (commit)",
    ])

  def test_dirty(self):
    prov = vbabb.Provenance(
        source_path='prep.vba',
        version='abc1234',
        timestamp='2026-09-17T14:00:00+00:00',
        timestamp_source='file mtime',
        dirty=True,
    )
    header = vbabb.format_provenance_header(prov)
    self.assertIn("' Version: abc1234 (dirty)", header)
    self.assertIn("(file mtime)", header)

  def test_non_git_has_no_version(self):
    prov = vbabb.Provenance(
        source_path='prep.vba',
        version=None,
        timestamp='2026-09-17T14:00:00+00:00',
        timestamp_source='file mtime',
        dirty=False,
    )
    header = vbabb.format_provenance_header(prov)
    self.assertNotIn('Version:', header)
    self.assertEqual(len(header.splitlines()), 2)


class InsertHeaderTest(unittest.TestCase):
  HEADER = "' Source: prep.vba\r\n"

  def test_after_attribute_block(self):
    source = 'Attribute VB_Name = "Prep"\r\nOption Explicit\r\n'
    out = vbabb.insert_header_after_attributes(source, self.HEADER)
    self.assertEqual(
        out,
        'Attribute VB_Name = "Prep"\r\n' + self.HEADER + 'Option Explicit\r\n',
    )

  def test_no_attribute_block(self):
    out = vbabb.insert_header_after_attributes('Option Explicit\r\n', self.HEADER)
    self.assertTrue(out.startswith(self.HEADER))

  def test_class_preamble_stays_first_after_header(self):
    source = 'VERSION 1.0 CLASS\r\nBEGIN\r\nEND\r\n'
    out = vbabb.insert_header_after_attributes(source, self.HEADER)
    self.assertTrue(out.startswith(self.HEADER))
    self.assertIn('VERSION 1.0 CLASS', out)


class BuildProvenanceTest(unittest.TestCase):
  def make_file(self) -> Path:
    tmp = tempfile.NamedTemporaryFile(prefix='provtest-', suffix='.vba', delete=False)
    tmp.write(b"' hello\n")
    tmp.close()
    return Path(tmp.name)

  def test_non_git(self):
    path = self.make_file()
    try:
      with patch('vbabb.run_git', return_value=(False, '')) as run:
        prov = vbabb.build_provenance(path)
        run.assert_called()
      self.assertIsNone(prov.version)
      self.assertEqual(prov.timestamp_source, 'file mtime')
      self.assertEqual(prov.source_path, str(path))
    finally:
      path.unlink(missing_ok=True)

  def test_untracked_file(self):
    path = self.make_file()
    try:
      def fake(args, cwd):
        if args[0] == 'rev-parse':
          return True, str(path.parent)
        if args[0] == 'ls-files':
          return False, ''
        self.fail(f'unexpected git call: {args}')
      with patch('vbabb.run_git', side_effect=fake):
        prov = vbabb.build_provenance(path)
      self.assertIsNone(prov.version)
      self.assertEqual(prov.timestamp_source, 'file mtime')
    finally:
      path.unlink(missing_ok=True)

  def test_clean_tracked(self):
    path = self.make_file()
    try:
      def fake(args, cwd):
        cmd = args[0]
        if cmd == 'rev-parse':
          return True, str(path.parent)
        if cmd == 'ls-files':
          return True, 'provtest.vba'
        if cmd == 'log':
          return True, 'abc1234' * 10 + '\x00abc1234\x001789646400'
        if cmd == 'describe':
          return True, 'v1.2.3-4-gabc1234'
        if cmd == 'status':
          return True, ''
        self.fail(f'unexpected git call: {args}')
      with patch('vbabb.run_git', side_effect=fake):
        prov = vbabb.build_provenance(path)
      self.assertEqual(prov.version, 'v1.2.3-4-gabc1234')
      self.assertEqual(prov.timestamp, '2026-09-17T12:00:00+00:00')
      self.assertEqual(prov.timestamp_source, 'commit')
      self.assertFalse(prov.dirty)
    finally:
      path.unlink(missing_ok=True)

  def test_dirty_tracked(self):
    path = self.make_file()
    try:
      def fake(args, cwd):
        cmd = args[0]
        if cmd == 'rev-parse':
          return True, str(path.parent)
        if cmd == 'ls-files':
          return True, 'provtest.vba'
        if cmd == 'log':
          return True, 'abc1234' * 10 + '\x00abc1234\x001789646400'
        if cmd == 'describe':
          return True, 'v1.2.3-4-gabc1234'
        if cmd == 'status':
          return True, ' M provtest.vba'
        self.fail(f'unexpected git call: {args}')
      with patch('vbabb.run_git', side_effect=fake):
        prov = vbabb.build_provenance(path)
      self.assertEqual(prov.version, 'v1.2.3-4-gabc1234')
      self.assertTrue(prov.dirty)
      self.assertEqual(prov.timestamp_source, 'file mtime')
    finally:
      path.unlink(missing_ok=True)

  def test_describe_failure_uses_short_hash(self):
    path = self.make_file()
    try:
      def fake(args, cwd):
        cmd = args[0]
        if cmd == 'rev-parse':
          return True, str(path.parent)
        if cmd == 'ls-files':
          return True, 'provtest.vba'
        if cmd == 'log':
          return True, 'abc1234' * 10 + '\x00abc1234\x001789646400'
        if cmd == 'describe':
          return False, 'fatal: No names found'
        if cmd == 'status':
          return True, ''
        self.fail(f'unexpected git call: {args}')
      with patch('vbabb.run_git', side_effect=fake):
        prov = vbabb.build_provenance(path)
      self.assertEqual(prov.version, 'abc1234')
    finally:
      path.unlink(missing_ok=True)


@unittest.skipIf(shutil.which('git') is None, 'git not available')
class GitIntegrationTest(unittest.TestCase):
  def setUp(self):
    self.tmp = tempfile.TemporaryDirectory()
    self.root = Path(self.tmp.name)
    self.git = lambda *args: subprocess.run(
        ['git', *args],
        cwd=str(self.root),
        capture_output=True,
        text=True,
        check=True,
    )
    self.git('init', '-q')
    self.git('config', 'user.email', 'test@example.com')
    self.git('config', 'user.name', 'Test User')
    self.file = self.root / 'src' / 'module.vba'
    self.file.parent.mkdir()
    self.file.write_text("' hi\n")

  def tearDown(self):
    self.tmp.cleanup()

  def test_clean_dirty_and_tag(self):
    self.git('add', '.')
    self.git('commit', '-q', '-m', 'initial')
    self.git('tag', 'v0.0.1')

    prov = vbabb.build_provenance(self.file)
    self.assertEqual(prov.version, 'v0.0.1')
    self.assertFalse(prov.dirty)
    self.assertEqual(prov.timestamp_source, 'commit')

    self.file.write_text("' changed\n")
    prov = vbabb.build_provenance(self.file)
    self.assertEqual(prov.version, 'v0.0.1')
    self.assertTrue(prov.dirty)
    self.assertEqual(prov.timestamp_source, 'file mtime')

  def test_untracked_in_repo(self):
    prov = vbabb.build_provenance(self.file)
    self.assertIsNone(prov.version)
    self.assertEqual(prov.timestamp_source, 'file mtime')

  def test_bas_class_export_keeps_class_kind(self):
    source = self.root / 'klass.bas'
    source.write_text(
        'VERSION 1.0 CLASS\n'
        'BEGIN\n'
        "  MultiUse = -1  'True\n"
        'END\n'
        'Attribute VB_Name = "Klass"\n'
        'Attribute VB_GlobalNameSpace = False\n'
        'Attribute VB_Creatable = False\n'
        'Attribute VB_PredeclaredId = False\n'
        'Attribute VB_Exposed = False\n'
        'Public Sub Hello()\n'
        "    Debug.Print \"hi\"\n"
        'End Sub\n',
    )
    out = self.root / 'out.xlsm'
    self.assertEqual(vbabb.main(['--output', str(out), str(source)]), 0)
    with ExcelFile(out) as wb:
      modules = [m for m in wb.vba_project().modules if m.name == 'Klass']
    self.assertEqual(len(modules), 1)
    self.assertEqual(modules[0].kind, VBAModuleKind.other)


if __name__ == '__main__':
  unittest.main()
