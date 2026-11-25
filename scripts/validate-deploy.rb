# Offline structure/invariant checks, not Kubernetes API schema validation.
require 'yaml'
require 'open3'

def check_job(job)
  raise 'automatic retry enabled' unless job['backoffLimit'] == 0
  pod = job.fetch('template').fetch('spec')
  raise 'unexpected restart/token' unless pod['restartPolicy'] == 'Never' && pod['automountServiceAccountToken'] == false
  raise 'nonroot required' unless pod.dig('securityContext', 'runAsNonRoot') == true
  pod.fetch('containers').each do |c|
    raise 'rootfs writable' unless c.dig('securityContext', 'readOnlyRootFilesystem') == true
    raise 'privilege escalation' unless c.dig('securityContext', 'allowPrivilegeEscalation') == false
    raise 'missing limits' unless c.dig('resources', 'limits', 'memory')
    raise 'unexpected service port' if c['ports']
  end
end

Dir['deploy/kubernetes/*.yaml'].each do |path|
  doc = YAML.load_file(path)
  check_job(doc['spec']) if doc['kind'] == 'Job'
  if doc['kind'] == 'CronJob'
    raise 'overlap enabled' unless doc.dig('spec','concurrencyPolicy') == 'Forbid'
    check_job(doc.dig('spec','jobTemplate','spec'))
  end
end
['', '0 2 * * *'].each do |schedule|
  output, status = Open3.capture2('helm','template','check','deploy/helm/red-runner','--set',"schedule=#{schedule}")
  raise 'helm render failed' unless status.success?
  doc = YAML.load(output)
  check_job(doc['kind'] == 'Job' ? doc['spec'] : doc.dig('spec','jobTemplate','spec'))
end
puts 'Standalone and rendered Helm workload invariants passed'
